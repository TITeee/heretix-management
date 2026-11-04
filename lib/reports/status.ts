import type { ScopeNumbers } from "./executive"

/**
 * The executive report's judgement of a set of assets, by a few fixed rules so that it always
 * means the same thing, with the reasons that led to it:
 *
 *   action    known exploited findings past their due date, or malicious packages, are open
 *   behind    fewer findings were resolved by their due date than the target, or more open
 *             findings are past their due date than when the period started
 *   on_track  neither
 *
 * Only what calls for action now is red, so that red is not the usual state and still gets read.
 */

export type StatusLevel = "action" | "behind" | "on_track"

export type Status = { level: StatusLevel; reasons: string[] }

export const STATUS_LABELS: Record<StatusLevel, string> = {
  action: "Action needed",
  behind: "Behind target",
  on_track: "On track",
}

const n = (value: number) => value.toLocaleString("en-US")
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`

/** target: the share to resolve by the due date, 0 to 1. */
export function judge(scope: Pick<ScopeNumbers, "open" | "period" | "trendOverdue">, target: number): Status {
  const action: string[] = []
  if (scope.open.kevOverdue > 0) {
    action.push(`${plural(scope.open.kevOverdue, "known exploited finding is", "known exploited findings are")} past the due date`)
  }
  if (scope.open.malicious > 0) {
    action.push(`${plural(scope.open.malicious, "malicious package is", "malicious packages are")} open`)
  }

  const behind: string[] = []
  const rate = scope.period.onTimeRate
  if (rate != null && rate < target) {
    behind.push(`${Math.round(rate * 100)}% were resolved by the due date against a ${Math.round(target * 100)}% target`)
  }
  const overdue = scope.trendOverdue
  if (overdue.length >= 2 && overdue[overdue.length - 1] > overdue[0]) {
    behind.push(`open findings past the due date rose from ${n(overdue[0])} to ${n(overdue[overdue.length - 1])}`)
  }

  const level: StatusLevel = action.length > 0 ? "action" : behind.length > 0 ? "behind" : "on_track"
  return { level, reasons: [...action, ...behind] }
}
