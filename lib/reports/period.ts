/**
 * The period a report covers, as [from, to): from is the first day included, to the first day
 * after the last. Days are UTC days, written YYYY-MM-DD, so the same dates give the same report
 * whatever the server's time zone.
 */
export type ReportPeriod = { from: Date; to: Date }

export type PeriodPreset = "last_month" | "last_3_months"

const DAY_MS = 24 * 60 * 60 * 1000
/** Weekly points up to this length, monthly beyond it (about three months). */
const WEEKLY_MAX_DAYS = 92
/** A longer period is refused: the trend and the history reads grow with it. */
export const MAX_PERIOD_DAYS = 731

const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

/** The last whole calendar month, or the last three, before the month of `now`. */
export function presetPeriod(preset: PeriodPreset, now: Date = new Date()): ReportPeriod {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const to = utcDay(y, m, 1)
  const from = utcDay(y, m - (preset === "last_month" ? 1 : 3), 1)
  return { from, to }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(value: string): Date | null {
  const match = DATE_RE.exec(value)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = utcDay(y, m - 1, d)
  // Rejects 2026-02-30 and the like, which Date.UTC would roll over into March.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null
}

/**
 * The period from a first and a last day, both included. An error message instead when either is
 * not a date, the last is before the first, or the period is longer than MAX_PERIOD_DAYS.
 */
export function parsePeriod(firstDay: string, lastDay: string): ReportPeriod | { error: string } {
  const from = parseDay(firstDay)
  const last = parseDay(lastDay)
  if (!from || !last) return { error: "Dates must be written YYYY-MM-DD" }
  if (last < from) return { error: "The last day is before the first" }
  const to = new Date(last.getTime() + DAY_MS)
  if (periodDays({ from, to }) > MAX_PERIOD_DAYS) return { error: `A report covers at most ${MAX_PERIOD_DAYS} days` }
  return { from, to }
}

export function periodDays(period: ReportPeriod): number {
  return Math.round((period.to.getTime() - period.from.getTime()) / DAY_MS)
}

/** The period of the same length that ends where this one starts, to compare against. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  const length = period.to.getTime() - period.from.getTime()
  return { from: new Date(period.from.getTime() - length), to: period.from }
}

/** The last day included, for display: the day before `to`. */
export function lastDay(period: ReportPeriod): Date {
  return new Date(period.to.getTime() - DAY_MS)
}

/** YYYY-MM-DD of a UTC day. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The moments the trend counts open findings at: the start of the period, then every week (up to
 * WEEKLY_MAX_DAYS) or the first of every month, and the end of the period. A moment after `now`
 * is left out, since nothing is known about it yet.
 */
export function trendPoints(period: ReportPeriod, now: Date = new Date()): Date[] {
  const points: Date[] = [period.from]
  if (periodDays(period) <= WEEKLY_MAX_DAYS) {
    for (let t = period.from.getTime() + 7 * DAY_MS; t < period.to.getTime(); t += 7 * DAY_MS) points.push(new Date(t))
  } else {
    let month = utcDay(period.from.getUTCFullYear(), period.from.getUTCMonth() + 1, 1)
    while (month < period.to) {
      points.push(month)
      month = utcDay(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)
    }
  }
  points.push(period.to)
  return points.filter((p) => p <= now)
}
