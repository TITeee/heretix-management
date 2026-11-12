/**
 * One scan of every asset at a time. The schedule and the Assets page's
 * Rescan All both go through runScanAll, so they never scan the same asset at
 * once (two scans of one asset would race on the same alerts).
 *
 * The state lives on globalThis: Next.js can load the scheduler (from
 * instrumentation.ts) and the API routes as separate module copies in the one
 * process, and a module variable would then be two variables.
 */
import { scanAllAssets, type ScanAllResult } from "@/lib/scan"

export type ScanAllRun = {
  trigger: "schedule" | "manual"
  /** Who started it, for a manual run. */
  by: string | null
  startedAt: Date
  finishedAt: Date | null
  done: number
  total: number
  failed: number
  failures: ScanAllResult["failures"]
  /** Set when the run itself stopped (the assets could not be read), not when an asset failed. */
  error: string | null
}

type State = { current: ScanAllRun | null; last: ScanAllRun | null }

const KEY = Symbol.for("heretix.scanAllRun")

function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>
  return (g[KEY] ??= { current: null, last: null })
}

/** The run in progress, if any, and the last one that finished. */
export function scanAllStatus(): { running: ScanAllRun | null; last: ScanAllRun | null } {
  const s = state()
  return { running: s.current, last: s.last }
}

/**
 * Scan every asset unless a run is already going, in which case it returns null
 * at once. The check and the claim happen before the first await, so two
 * callers can never both start.
 */
export async function runScanAll(trigger: ScanAllRun["trigger"], by: string | null = null): Promise<ScanAllRun | null> {
  const s = state()
  if (s.current) return null
  const run: ScanAllRun = {
    trigger, by, startedAt: new Date(), finishedAt: null, done: 0, total: 0, failed: 0, failures: [], error: null,
  }
  s.current = run
  try {
    const result = await scanAllAssets(({ done, total, failed }) => {
      run.done = done
      run.total = total
      run.failed = failed
    })
    run.failures = result.failures
    return run
  } catch (err) {
    run.error = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    run.finishedAt = new Date()
    s.last = run
    s.current = null
  }
}
