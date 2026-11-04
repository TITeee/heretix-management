import { describe, it, expect } from "vitest"
import { summaryLines } from "./summary"
import type { ExecutiveReport, PeriodNumbers, ScopeNumbers } from "./executive"

const flows = (detected: number, resolved: number, onTimeRate: number | null = null): PeriodNumbers => ({
  detected, resolved, resolvedWithDue: 0, resolvedOnTime: 0, onTimeRate,
  mttrCriticalDays: null, mttrHighDays: null, accepted: 0, ignoredOther: 0,
})

function report(all: Partial<ScopeNumbers>, decisions: Partial<Record<keyof ExecutiveReport["decisions"], number>> = {}, missionKev = 0): ExecutiveReport {
  const list = (total = 0) => ({ total, rows: [] })
  return {
    scopes: [{
      key: "all", kind: "all", label: "All assets", assets: 3,
      open: { alerts: 0, kev: 0, critical: 0, malicious: 0, overdue: 0, overdueLong: 0 },
      fixes: { changes: 0, alerts: 0, kevChanges: 0, kevAlerts: 0 },
      noFix: { alerts: 0, kev: 0, critical: 0 },
      period: flows(0, 0), previous: flows(0, 0), trend: [],
      ...all,
    }],
    decisions: {
      noFix: list(decisions.noFix), longOverdue: list(decisions.longOverdue),
      scanGaps: list(decisions.scanGaps), malicious: list(decisions.malicious),
    },
    missionCritical: { tagFound: true, assets: 1, kev: missionKev, critical: 0, rows: [] },
  } as unknown as ExecutiveReport
}

describe("summaryLines", () => {
  it("leads with the changes to make, then the period, then what needs a decision", () => {
    const lines = summaryLines(report(
      {
        open: { alerts: 8036, kev: 5, critical: 511, malicious: 0, overdue: 10, overdueLong: 2 },
        fixes: { changes: 37, alerts: 6247, kevChanges: 3, kevAlerts: 5 },
        noFix: { alerts: 1789, kev: 0, critical: 12 },
        period: flows(120, 340, 0.82),
        previous: flows(90, 100),
        trend: [8256, 8100, 8036],
      },
      { noFix: 4, longOverdue: 1, scanGaps: 2 },
      2,
    ))
    expect(lines).toEqual([
      "37 changes would resolve 6,247 of the 8,036 open findings on 3 assets; 1,789 have no fix yet and 5 are known to be exploited, 2 of them on mission critical assets.",
      "In the period 120 findings were detected and 340 resolved (previous period: 90 and 100); open findings went from 8,256 to 8,036.",
      "82% of the findings resolved in the period met their due date. Needs a decision: 4 exploited or Critical packages with no fix, 1 asset with findings over 30 days overdue, 2 assets not checked in the last 7 days.",
    ])
  })

  it("says so when nothing is open, exploited or waiting for a decision", () => {
    const lines = summaryLines(report({ trend: [0, 0] }))
    expect(lines).toEqual([
      "No findings are open on the 3 assets.",
      "In the period 0 findings were detected and 0 resolved (previous period: 0 and 0); open findings stayed at 0.",
      "Nothing needs a decision.",
    ])
  })
})
