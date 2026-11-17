/**
 * One metadata refresh at a time. The schedule and the Alerts page's Refresh
 * Metadata both go through runRefresh, as a scan of every asset goes through
 * runScanAll.
 *
 * Two refreshes at once each read an alert, each found the same change and each
 * wrote it and its event: an alert's timeline showed every change twice, 20
 * seconds apart. A refresh is paced and takes minutes on a large install, long
 * enough for someone to press Refresh again while the first still runs.
 *
 * The state lives on globalThis, as runScanAll's does: Next.js can load the
 * scheduler and the API routes as separate module copies in the one process.
 */
import { refreshMetadata } from "@/lib/refresh"

type State = { startedAt: Date | null }

const KEY = Symbol.for("heretix.refreshRun")

function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>
  return (g[KEY] ??= { startedAt: null })
}

/** When the refresh in progress started, or null when none runs. */
export function refreshRunningSince(): Date | null {
  return state().startedAt
}

/**
 * Refresh every open alert's metadata unless a refresh is already running, in
 * which case it returns null at once. The check and the claim happen before the
 * first await, so two callers can never both start.
 */
export async function runRefresh(): Promise<Awaited<ReturnType<typeof refreshMetadata>> | null> {
  const s = state()
  if (s.startedAt) return null
  s.startedAt = new Date()
  try {
    return await refreshMetadata()
  } finally {
    s.startedAt = null
  }
}
