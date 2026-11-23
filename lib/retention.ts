import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { createAuditLog } from "@/lib/audit"
import { logger } from "@/lib/logger"

/**
 * How long the two kinds of pure history are kept: the audit log and the scan history.
 * Nothing else is ever purged: alerts, their timelines, package history and the
 * decisions people made stay until their asset or package is deleted.
 *
 * Both are off until set in Settings (an empty value keeps everything), so an upgrade
 * deletes nothing by itself. A set period cannot go below a floor, in the Settings API
 * and again here when the purge reads it, so that the audit log of recent days cannot be
 * erased from the page (the change of a period is itself an audit entry).
 */
export const RETENTION_KEYS = { audit: "AUDIT_RETENTION_DAYS", scan: "SCAN_HISTORY_RETENTION_DAYS" } as const
export const AUDIT_MIN_DAYS = 90
export const SCAN_HISTORY_MIN_DAYS = 30
const MAX_DAYS = 36_500
/** The newest scans of every asset are kept whatever their age: the asset pages list them (and the last successful one). */
export const SCAN_HISTORY_KEEP_PER_ASSET = 10

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH_SIZE = 5_000
/** A first purge of a very large table is spread over days instead of holding the database for one long run. */
const MAX_BATCHES_PER_RUN = 400

const MIN_DAYS: Record<string, number> = {
  [RETENTION_KEYS.audit]: AUDIT_MIN_DAYS,
  [RETENTION_KEYS.scan]: SCAN_HISTORY_MIN_DAYS,
}

/** What is wrong with a retention setting's value, or null. An empty value means "keep everything". */
export function retentionProblem(key: string, value: string): string | null {
  const min = MIN_DAYS[key]
  if (min === undefined || value.trim() === "") return null
  if (!/^\d+$/.test(value.trim()) || Number(value) > MAX_DAYS) {
    return `${key} must be empty (keep everything) or a whole number of days, at least ${min}`
  }
  return Number(value) < min ? `${key} must be empty (keep everything) or at least ${min} days` : null
}

/** The days a stored value stands for: null to keep everything, otherwise never below the floor. */
export function effectiveDays(key: string, value: string | null | undefined): number | null {
  const v = (value ?? "").trim()
  if (!/^\d+$/.test(v)) return null
  return Math.min(Math.max(Number(v), MIN_DAYS[key] ?? 1), MAX_DAYS)
}

export type RetentionDays = { auditDays: number | null; scanDays: number | null }

export async function getRetentionConfig(): Promise<RetentionDays> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(RETENTION_KEYS) } } })
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    auditDays: effectiveDays(RETENTION_KEYS.audit, stored[RETENTION_KEYS.audit]),
    scanDays: effectiveDays(RETENTION_KEYS.scan, stored[RETENTION_KEYS.scan]),
  }
}

const cutoffOf = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS)

// The scans that are never purged: the newest of every asset, and its last completed one.
// Reads each asset's rows through the (assetId, createdAt) index.
const KEPT_SCANS = Prisma.sql`
  SELECT k.id FROM "Asset" a CROSS JOIN LATERAL (
    SELECT id FROM "ScanJob" WHERE "assetId" = a.id ORDER BY "createdAt" DESC LIMIT ${SCAN_HISTORY_KEEP_PER_ASSET}
  ) k
  UNION
  SELECT k.id FROM "Asset" a CROSS JOIN LATERAL (
    SELECT id FROM "ScanJob" WHERE "assetId" = a.id AND status = 'completed' ORDER BY "createdAt" DESC LIMIT 1
  ) k`

// A running scan is never purged either, however old it looks.
const expiredScans = (cutoff: Date) => Prisma.sql`
  SELECT j.id FROM "ScanJob" j
  WHERE j."createdAt" < ${cutoff} AND j.status <> 'running' AND j.id NOT IN (SELECT id FROM kept)`

export type ExpiredCounts = {
  audit: { total: number; expired: number; oldest: Date | null }
  scan: { total: number; expired: number; oldest: Date | null }
}

/** What a period would delete now, for the Settings page to show before it is saved. */
export async function countExpired(days: RetentionDays, now = new Date()): Promise<ExpiredCounts> {
  const [auditTotal, auditOldest, scanTotal, scanOldest] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.scanJob.count(),
    prisma.scanJob.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ])
  const auditExpired = days.auditDays === null ? 0 : await prisma.auditLog.count({ where: { createdAt: { lt: cutoffOf(days.auditDays, now) } } })
  const scanExpired = days.scanDays === null ? 0 : Number(
    (await prisma.$queryRaw<{ count: bigint }[]>`
      WITH kept AS (${KEPT_SCANS}) SELECT count(*) AS count FROM (${expiredScans(cutoffOf(days.scanDays, now))}) e`)[0].count
  )
  return {
    audit: { total: auditTotal, expired: auditExpired, oldest: auditOldest?.createdAt ?? null },
    scan: { total: scanTotal, expired: scanExpired, oldest: scanOldest?.createdAt ?? null },
  }
}

async function inBatches(deleteBatch: (limit: number) => Promise<number>, batchSize: number): Promise<number> {
  let deleted = 0
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const n = await deleteBatch(batchSize)
    deleted += n
    if (n < batchSize) break
  }
  return deleted
}

const plural = (n: number) => n.toLocaleString("en-US")

/**
 * Deletes what is older than the periods set in Settings, in batches, and says so with
 * one audit entry (none when nothing was deleted). Run daily by the scheduler.
 */
export async function purgeHistory(now = new Date(), batchSize = BATCH_SIZE): Promise<{ audit: number; scan: number }> {
  const { auditDays, scanDays } = await getRetentionConfig()
  let audit = 0
  let scan = 0

  if (auditDays !== null) {
    const cutoff = cutoffOf(auditDays, now)
    audit = await inBatches(
      (limit) => prisma.$executeRaw`
        DELETE FROM "AuditLog" WHERE id IN (SELECT id FROM "AuditLog" WHERE "createdAt" < ${cutoff} LIMIT ${limit})`,
      batchSize
    )
  }
  if (scanDays !== null) {
    const cutoff = cutoffOf(scanDays, now)
    scan = await inBatches(
      (limit) => prisma.$executeRaw`
        WITH kept AS (${KEPT_SCANS})
        DELETE FROM "ScanJob" WHERE id IN (${expiredScans(cutoff)} LIMIT ${limit})`,
      batchSize
    )
  }

  if (audit + scan > 0) {
    const parts: string[] = []
    if (auditDays !== null) parts.push(`audit log: ${plural(audit)} rows older than ${auditDays} days`)
    if (scanDays !== null) parts.push(`scan history: ${plural(scan)} rows older than ${scanDays} days`)
    await createAuditLog({ action: "history_purged", detail: parts.join("; ") })
  }
  logger.info("history purged", { audit, scan, auditDays, scanDays })
  return { audit, scan }
}
