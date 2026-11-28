/**
 * A range of days in a list's URL (the Audit Log's `from`/`to`, the Alerts list's
 * `detectedFrom`/`detectedTo`). Client-safe.
 *
 * Each end is a UTC day (YYYY-MM-DD, the whole day, both ends included) or an instant
 * (ISO 8601, `Z`). The pages send instants: the start and the end of the days the user
 * picked on the calendar, in their own time zone, since the times they see are local. A bare
 * day, as in a hand-written link, means the whole UTC day. Anything malformed is ignored
 * rather than refused.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const DAY_MS = 24 * 60 * 60 * 1000

/** A real calendar day (YYYY-MM-DD) or an instant (ISO 8601, in UTC), as the ISO form of either; or null. */
export function parseDateBound(value: string | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  if (DAY.test(v)) {
    const d = new Date(`${v}T00:00:00Z`)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
  }
  if (INSTANT.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.slice(0, 10) ? null : d.toISOString()
  }
  return null
}

/** Whether an end of the range is a day (the whole UTC day) and not an instant. */
export const isDayBound = (value: string) => DAY.test(value)

/**
 * The instants a range covers: from the first (inclusive) to `toExclusive` (exclusive), either
 * open. A day end is the whole UTC day, so `to` as a day stops at the start of the next day; an
 * instant `to` is included, which is the instant after it as an exclusive end (times are kept
 * to the millisecond).
 */
export function dateRangeInstants(from: string | null, to: string | null): { from: Date | null; toExclusive: Date | null } {
  return {
    from: from ? new Date(isDayBound(from) ? `${from}T00:00:00Z` : from) : null,
    toExclusive: to
      ? isDayBound(to)
        ? new Date(new Date(`${to}T00:00:00Z`).getTime() + DAY_MS)
        : new Date(new Date(to).getTime() + 1)
      : null,
  }
}

// The days the calendar picks are the user's own, the ones the page's times are shown in.
/** The first instant of a local day. */
export const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
/** The last instant of a local day. */
export const endOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
/** The local day an end of the range falls on, for the calendar. A UTC day shows as the day of that name. */
export function boundToLocalDay(value: string): Date {
  if (DAY.test(value)) {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}
