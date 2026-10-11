import { prisma } from "@/lib/db"

/**
 * How the last metadata refresh went.
 *
 * A refresh that changed nothing leaves no MetadataRefreshRun row (it is deleted),
 * and one that failed never wrote one, so the runs cannot say when it last worked.
 * The outcome is kept in a Setting instead: one small record, overwritten each run.
 */
export type RefreshStatus = {
  /** When the last refresh finished (or stopped). */
  at: string
  /** Vulnerabilities it looked up, and how many of those lookups failed. */
  total: number
  failed: number
  /** Set when the refresh stopped with an error instead of finishing. */
  error: string | null
  /** The last refresh that did not fail; null if none has. */
  lastSuccessAt: string | null
}

const KEY = "METADATA_REFRESH_STATUS"

/**
 * A refresh failed when it stopped with an error, or when half or more of its
 * lookups failed, which is heretix-api being down or unreachable. A lookup or two
 * failing on a day is noise: logged, not announced.
 */
export function refreshFailed(s: Pick<RefreshStatus, "total" | "failed" | "error">): boolean {
  if (s.error !== null) return true
  return s.total > 0 && s.failed * 2 >= s.total
}

export async function getRefreshStatus(): Promise<RefreshStatus | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as RefreshStatus
  } catch {
    return null
  }
}

/** Records a finished or failed refresh, carrying the last success forward. Never throws: a status that cannot be saved must not fail the refresh. */
export async function recordRefreshStatus(outcome: { total: number; failed: number; error?: string | null }): Promise<RefreshStatus | null> {
  try {
    const previous = await getRefreshStatus()
    const at = new Date().toISOString()
    const status: RefreshStatus = {
      at,
      total: outcome.total,
      failed: outcome.failed,
      error: outcome.error ?? null,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
    }
    if (!refreshFailed(status)) status.lastSuccessAt = at
    const value = JSON.stringify(status)
    await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
    return status
  } catch {
    return null
  }
}
