import { escapeCSV } from "@/lib/alerts/export-format"
import type { ExecutiveReport, PeriodNumbers, ScopeNumbers } from "./executive"
import { formatDay, lastDay } from "./period"

/**
 * The executive report's per-tag table as CSV: one row for all assets, one per chosen tag and
 * one for the assets with no tag, with the numbers for the period and the one before it side
 * by side. The lists (decisions, accepted risks) stay on the page, so the file is one table a
 * spreadsheet can take as it is.
 */

const round = (value: number | null, digits: number) => value == null ? null : Number(value.toFixed(digits))

const PERIOD_COLUMNS: [string, (p: PeriodNumbers) => number | null][] = [
  ["Detected", (p) => p.detected],
  ["Resolved", (p) => p.resolved],
  ["Resolved With Due Date", (p) => p.resolvedWithDue],
  ["Resolved On Time", (p) => p.resolvedOnTime],
  ["On-Time Rate", (p) => round(p.onTimeRate, 3)],
  ["MTTR Critical (days)", (p) => round(p.mttrCriticalDays, 1)],
  ["MTTR High (days)", (p) => round(p.mttrHighDays, 1)],
  ["Accepted Risk", (p) => p.accepted],
  ["Other Ignored", (p) => p.ignoredOther],
]

const COLUMNS: [string, (s: ScopeNumbers) => string | number | null][] = [
  ["Scope", (s) => s.label],
  ["Assets", (s) => s.assets],
  ["Changes To Make", (s) => s.fixes.changes],
  ["Findings Those Changes Resolve", (s) => s.fixes.alerts],
  ["Changes Resolving Exploited Findings", (s) => s.fixes.kevChanges],
  ["Open Findings", (s) => s.open.alerts],
  ["Known Exploited", (s) => s.open.kev],
  ["Critical", (s) => s.open.critical],
  ["Malicious Packages", (s) => s.open.malicious],
  ["Overdue", (s) => s.open.overdue],
  ["Overdue Over 30 Days", (s) => s.open.overdueLong],
  ["No Fix Yet", (s) => s.noFix.alerts],
  ["No Fix Yet (Known Exploited)", (s) => s.noFix.kev],
  ["No Fix Yet (Critical)", (s) => s.noFix.critical],
  ...PERIOD_COLUMNS.map(([name, pick]): [string, (s: ScopeNumbers) => number | null] => [name, (s) => pick(s.period)]),
  ...PERIOD_COLUMNS.map(([name, pick]): [string, (s: ScopeNumbers) => number | null] => [`Previous ${name}`, (s) => pick(s.previous)]),
]

export function executiveCsv(report: ExecutiveReport): string {
  const lines = [COLUMNS.map(([name]) => escapeCSV(name)).join(",")]
  for (const scope of report.scopes) lines.push(COLUMNS.map(([, pick]) => escapeCSV(pick(scope))).join(","))
  return lines.join("\r\n")
}

export function executiveCsvFilename(report: ExecutiveReport): string {
  return `executive-summary-${formatDay(report.period.from)}-to-${formatDay(lastDay(report.period))}.csv`
}
