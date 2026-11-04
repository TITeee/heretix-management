/**
 * The period a report covers, as [from, to). A report's period always ends now: what stands now
 * (the decisions, the changes to make) and what happened in the period then meet at one moment,
 * where a past period would end weeks before the state the report shows. A past report is kept
 * by saving it, not by making it again. Days are UTC days, written YYYY-MM-DD, so the same date
 * gives the same report whatever the server's time zone.
 */
export type ReportPeriod = { from: Date; to: Date }

export type PeriodPreset = "last_30_days" | "last_90_days"

const DAY_MS = 24 * 60 * 60 * 1000
/** Weekly points up to this length, monthly beyond it (about three months). */
const WEEKLY_MAX_DAYS = 92
/** A longer period is refused: the trend and the history reads grow with it. */
export const MAX_PERIOD_DAYS = 731

const PRESET_DAYS: Record<PeriodPreset, number> = { last_30_days: 30, last_90_days: 90 }

const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

/** The last 30 or 90 days, up to now. */
export function presetPeriod(preset: PeriodPreset, now: Date = new Date()): ReportPeriod {
  return { from: new Date(now.getTime() - PRESET_DAYS[preset] * DAY_MS), to: now }
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
 * The period from the start of a day up to now. An error message instead when the day is not a
 * date, is not before today, or starts a period longer than MAX_PERIOD_DAYS.
 */
export function parseSince(firstDay: string, now: Date = new Date()): ReportPeriod | { error: string } {
  const from = parseDay(firstDay)
  if (!from) return { error: "The first day must be written YYYY-MM-DD" }
  const today = utcDay(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (from >= today) return { error: "The first day must be before today" }
  if (periodDays({ from, to: now }) > MAX_PERIOD_DAYS) return { error: `A report covers at most ${MAX_PERIOD_DAYS} days` }
  return { from, to: now }
}

export function periodDays(period: ReportPeriod): number {
  return Math.round((period.to.getTime() - period.from.getTime()) / DAY_MS)
}

/** The period of the same length that ends where this one starts, to compare against. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  const length = period.to.getTime() - period.from.getTime()
  return { from: new Date(period.from.getTime() - length), to: period.from }
}

/** YYYY-MM-DD of a UTC day. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The moments the trend counts open findings at: the start of the period, then every week (up to
 * WEEKLY_MAX_DAYS) or the first of every month, and the end of the period. A moment after `now`
 * is left out, since nothing is known about it yet; a period still running ends at `now` instead.
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
  const known = points.filter((p) => p <= now)
  if (period.to > now && now > period.from && known.at(-1)?.getTime() !== now.getTime()) known.push(now)
  return known
}
