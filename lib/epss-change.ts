/**
 * How an `epss_changed` timeline event reads. The event is recorded when the
 * EPSS score moves by 0.001 or more (lib/alert-metadata.ts), so the text has
 * to show the score: the percentile alone, shown to one decimal, can read the
 * same on both sides (98.1%ile to 98.1%ile) when the score moved at the top.
 * Events written before the percentile was kept have only the scores.
 */

type EpssChangeData = Record<string, unknown>

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** "0.296" (three decimals: the smallest change recorded is 0.001). */
function score(v: unknown): string {
  const n = num(v)
  return n === null ? "n/a" : n.toFixed(3)
}

/** "98.1%ile", or null when the event has no percentile. */
function percentile(v: unknown): string | null {
  const n = num(v)
  return n === null ? null : `${(n * 100).toFixed(1)}%ile`
}

/** One side of the change: the score, with its percentile in brackets when known. */
export function epssSide(data: EpssChangeData, side: "from" | "to"): string {
  const p = percentile(side === "from" ? data.percentileFrom : data.percentileTo)
  const s = score(data[side])
  return p ? `${s} (${p})` : s
}

/** "0.296 (98.1%ile) → 0.295 (98.1%ile)" */
export function epssChangeText(data: EpssChangeData): string {
  return `${epssSide(data, "from")} → ${epssSide(data, "to")}`
}
