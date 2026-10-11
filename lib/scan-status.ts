import { prisma } from "@/lib/db"

/**
 * How an asset's scans have been going, from its scan jobs.
 *
 * Asset.scannedAt cannot say: a scan sets it, but so does an inventory import
 * (to the SBOM's own timestamp), so it can be older or newer than the last scan
 * and says nothing about a scan that failed. The jobs are the record.
 */
export type ScanStatus = {
  /** When the last scan that completed finished; null if none has. */
  lastSuccessAt: Date | null
  /** The most recent scan that completed or failed (a running one is not an outcome yet). */
  lastAttempt: { at: Date; failed: boolean; error: string | null } | null
  /** Failed scans since the last success (all of them if there was none). */
  failedSince: number
}

/** After this long without a successful scan the dashboard says the scheduler may not be running. */
export const DEFAULT_STALE_HOURS = 36

export function staleAfterMs(): number {
  const hours = Number(process.env.SCAN_STALE_HOURS)
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_STALE_HOURS) * 60 * 60 * 1000
}

/** True when the newest successful scan (null: none) is older than the threshold. */
export function isScanStale(newestSuccessAt: Date | null, now: Date, thresholdMs = staleAfterMs()): boolean {
  return newestSuccessAt === null || now.getTime() - newestSuccessAt.getTime() > thresholdMs
}

type Row = {
  assetId: string
  lastSuccessAt: Date | null
  lastStatus: string | null
  lastAttemptAt: Date | null
  lastError: string | null
  failedSince: number
}

/**
 * The status of one asset, or of every asset (keyed by id). Assets that have
 * never been scanned are in the map with nothing recorded.
 */
export async function getScanStatuses(assetId?: string): Promise<Map<string, ScanStatus>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      a.id AS "assetId",
      s."lastSuccessAt",
      l.status AS "lastStatus",
      l."createdAt" AS "lastAttemptAt",
      l."errorMsg" AS "lastError",
      (
        SELECT count(*)::int FROM "ScanJob" f
        WHERE f."assetId" = a.id AND f.status = 'failed'
          AND f."createdAt" > COALESCE(s."lastSuccessStart", 'epoch'::timestamp)
      ) AS "failedSince"
    FROM "Asset" a
    LEFT JOIN LATERAL (
      SELECT max("completedAt") AS "lastSuccessAt", max("createdAt") AS "lastSuccessStart"
      FROM "ScanJob" WHERE "assetId" = a.id AND status = 'completed'
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT status, "createdAt", "errorMsg" FROM "ScanJob"
      WHERE "assetId" = a.id AND status IN ('completed', 'failed')
      ORDER BY "createdAt" DESC LIMIT 1
    ) l ON true
    WHERE (${assetId ?? null}::text IS NULL OR a.id = ${assetId ?? null})`

  return new Map(rows.map((r) => [r.assetId, {
    lastSuccessAt: r.lastSuccessAt,
    lastAttempt: r.lastAttemptAt
      ? { at: r.lastAttemptAt, failed: r.lastStatus === "failed", error: r.lastError }
      : null,
    failedSince: r.failedSince,
  }]))
}
