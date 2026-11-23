/**
 * How the Data retention tab words and colours what a period means for a kind of history.
 * Client-safe; the tab (app/(console)/settings/retention-tab.tsx) only draws it.
 */
export type RetentionCounts = { total: number; expired: number; oldest: string | null }
export type RetentionTone = "neutral" | "ok" | "warn"
export type RetentionState = { tone: RetentionTone; badge: string; text: string }

const n = (v: number) => v.toLocaleString("en-US")
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "none")

/**
 * `days` is the selected period, "" for keep everything. neutral: nothing is deleted (or not
 * known yet); ok: a period is on and no row is older than it; warn: rows older than it wait
 * for the next daily run.
 */
export function retentionState(counts: RetentionCounts | undefined, days: string): RetentionState {
  if (!counts) return { tone: "neutral", badge: "Counting", text: "Counting the rows..." }
  if (days === "") {
    return { tone: "neutral", badge: "Keeping everything", text: `${n(counts.total)} rows. Oldest from ${day(counts.oldest)}.` }
  }
  if (counts.expired === 0) {
    return { tone: "ok", badge: `Deleting after ${days} days`, text: `${n(counts.total)} rows. None older than ${days} days.` }
  }
  return {
    tone: "warn",
    badge: `${n(counts.expired)} to delete`,
    text: `${n(counts.expired)} of ${n(counts.total)} rows are older than ${days} days. They are deleted at the next daily run.`,
  }
}

/** The selector's items: the usual periods, plus `current` when it is something else (one set through the API). */
export function choicesWith(base: [string, string][], current: string): [string, string][] {
  if (current === "" || base.some(([v]) => v === current)) return base
  return [...base, [current, `${current} days`] as [string, string]].sort((a, b) => Number(a[0]) - Number(b[0]))
}
