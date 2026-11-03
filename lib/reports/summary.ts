import type { ExecutiveReport, ScopeNumbers } from "./executive"

/**
 * The three sentences that open the executive summary, made from the all-assets numbers by
 * fixed wording, so that the same numbers always read the same way: where things stand, what
 * changed in the period, and what needs a decision.
 */

const n = (value: number) => value.toLocaleString("en-US")
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`

function standing(all: ScopeNumbers): string {
  if (all.open.alerts === 0) return `No findings are open on the ${plural(all.assets, "asset")}.`
  const fixed = `${plural(all.fixes.changes, "change")} would resolve ${n(all.fixes.alerts)} of the ${plural(all.open.alerts, "open finding")} on ${plural(all.assets, "asset")}`
  // What no change resolves has to be said too, or most of a fleet's findings go unexplained.
  const noFix = all.noFix.alerts > 0 ? `${n(all.noFix.alerts)} have no fix yet and ` : ""
  const exploited = all.open.kev === 0
    ? "none is known to be exploited"
    : `${n(all.open.kev)} ${all.open.kev === 1 ? "is" : "are"} known to be exploited`
  return `${fixed}; ${noFix}${exploited}.`
}

function change(all: ScopeNumbers, trend: number[]): string {
  const now = all.period
  const before = all.previous
  const flows = `In the period ${plural(now.detected, "finding was", "findings were")} detected and ${n(now.resolved)} resolved (previous period: ${n(before.detected)} and ${n(before.resolved)})`
  if (trend.length < 2) return `${flows}.`
  const start = trend[0]
  const end = trend[trend.length - 1]
  const direction = end === start ? `stayed at ${n(end)}` : `went from ${n(start)} to ${n(end)}`
  return `${flows}; open findings ${direction}.`
}

function attention(report: ExecutiveReport): string {
  const d = report.decisions
  const items = [
    d.noFix.total > 0 && `${plural(d.noFix.total, "exploited or Critical package", "exploited or Critical packages")} with no fix`,
    d.longOverdue.total > 0 && `${plural(d.longOverdue.total, "asset")} with findings over 30 days overdue`,
    d.scanGaps.total > 0 && `${plural(d.scanGaps.total, "asset")} not scanned recently`,
    d.malicious.total > 0 && `${plural(d.malicious.total, "malicious package")}`,
  ].filter((s): s is string => typeof s === "string")
  const rate = report.scopes[0].period.onTimeRate
  const sla = rate == null ? "" : `${Math.round(rate * 100)}% of the findings resolved in the period met their due date. `
  return items.length === 0 ? `${sla}Nothing needs a decision.` : `${sla}Needs a decision: ${items.join(", ")}.`
}

export function summaryLines(report: ExecutiveReport): string[] {
  const all = report.scopes[0]
  return [standing(all), change(all, all.trend), attention(report)]
}
