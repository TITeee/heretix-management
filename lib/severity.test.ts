import { describe, it, expect } from "vitest"
import { buildAlertSummary } from "@/components/alerts/alert-summary-badges"
import { countSeverityByKey } from "./severity"

describe("countSeverityByKey", () => {
  const alerts = [
    { assetId: "a", severity: "CRITICAL" },
    { assetId: "a", severity: "HIGH" },
    { assetId: "a", severity: "HIGH" },
    { assetId: "b", severity: "LOW" },
    { assetId: "b", severity: null },
    // GHSA wording outside the four known tiers
    { assetId: "b", severity: "MODERATE" },
  ]

  it("counts each key's alerts per tier", () => {
    const byAsset = countSeverityByKey(alerts, a => a.assetId)
    expect(byAsset.get("a")).toEqual({ critical: 1, high: 2, medium: 0, low: 0, na: 0 })
    expect(byAsset.get("b")).toEqual({ critical: 0, high: 0, medium: 0, low: 1, na: 2 })
  })

  it("adds up to the Open Alert Summary built from the same alerts", () => {
    const byAsset = [...countSeverityByKey(alerts, a => a.assetId).values()]
    const total = (tier: "critical" | "high" | "medium" | "low" | "na") => byAsset.reduce((n, c) => n + c[tier], 0)
    const summary = buildAlertSummary(alerts.map(a => ({ severity: a.severity, _count: { id: 1 } })))
    expect({
      CRITICAL: total("critical"), HIGH: total("high"), MEDIUM: total("medium"), LOW: total("low"), UNKNOWN: total("na"),
    }).toEqual({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, ...summary })
  })
})
