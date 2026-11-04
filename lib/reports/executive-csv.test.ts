import { describe, it, expect } from "vitest"
import { executiveCsv, executiveCsvFilename } from "./executive-csv"
import type { ExecutiveReport, PeriodNumbers, ScopeNumbers } from "./executive"

const period = (resolved: number, onTimeRate: number | null, mttrCriticalDays: number | null): PeriodNumbers => ({
  detected: 4, resolved, resolvedWithDue: 3, resolvedOnTime: 2, onTimeRate,
  mttrCriticalDays, mttrHighDays: null, medianCriticalDays: mttrCriticalDays == null ? null : 4.5, medianHighDays: null, accepted: 1, ignoredOther: 0,
})

const scope = (label: string, previous: PeriodNumbers, trendOverdue: number[] = []): ScopeNumbers => ({
  key: label, kind: "tag", label, assets: 2,
  open: { alerts: 10, kev: 1, critical: 3, malicious: 0, overdue: 2, kevOverdue: 0, overdueLong: 1 },
  fixes: { changes: 4, alerts: 7, kevChanges: 1, kevAlerts: 1 },
  noFix: { alerts: 3, kev: 0, critical: 1 },
  period: period(5, 2 / 3, 6.25), previous, trend: [], trendOverdue, trendAged: trendOverdue.map((v) => v * 10),
  status: { level: "behind", reasons: [] },
})

const report = {
  period: { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-01T00:00:00Z") },
  scopes: [scope("All assets", period(0, null, null), [4, 5, 3]), scope("=Sales", period(1, 1, 2))],
} as unknown as ExecutiveReport

describe("executiveCsv", () => {
  it("writes one row per scope, this period then the previous one, rates rounded", () => {
    const [header, all, sales] = executiveCsv(report).split("\r\n")
    const columns = header.split(",")
    expect(columns).toHaveLength(41)
    expect(columns[40]).toBe('"Status"')
    expect(columns[36]).toBe('"Median Time To Resolve Critical (days)"')
    expect(columns.slice(32, 36)).toEqual([
      '"Open Past Due At End"', '"Open Over 90 Days At End"', '"Previous Open Past Due At End"', '"Previous Open Over 90 Days At End"',
    ])
    expect(columns.slice(0, 3)).toEqual(['"Scope"', '"Assets"', '"Changes To Make"'])
    expect(columns[23]).toBe('"Previous Detected"')
    const cells = all.split(",")
    expect(cells.slice(0, 6)).toEqual(['"All assets"', '"2"', '"4"', '"7"', '"1"', '"10"'])
    expect(cells[18]).toBe('"0.667"') // on-time rate
    expect(cells[19]).toBe('"6.3"') // MTTR Critical
    expect(cells[27]).toBe('""') // no previous on-time rate
    expect(cells.slice(32, 36)).toEqual(['"3"', '"30"', '"4"', '"40"']) // the last point, then the first
    expect(cells.slice(36, 40)).toEqual(['"4.5"', '""', '""', '""']) // medians: this period's Critical only
    expect(cells[40]).toBe('"Behind target"')
    expect(sales.split(",").slice(32, 36)).toEqual(['""', '""', '""', '""']) // no history
    // A tag name that would start a formula is written as text.
    expect(sales.startsWith(`"'=Sales"`)).toBe(true)
  })

  it("names the file after the period", () => {
    expect(executiveCsvFilename(report)).toBe("executive-summary-2026-10-01-to-2026-11-01.csv")
  })
})
