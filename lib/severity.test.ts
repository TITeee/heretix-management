import { describe, it, expect } from "vitest"
import { buildAlertSummary } from "@/components/alerts/alert-summary-badges"
import { countSeverity, countSeverityByKey, getAlertSeverityTier } from "./severity"

describe("getAlertSeverityTier", () => {
  it("takes the tier from the severity, not the score", () => {
    // CVSS v2 has no Critical: a v2 10.0 is HIGH, and must not become Critical
    // by applying v3 thresholds to the score.
    expect(getAlertSeverityTier("HIGH", 10)).toBe("high")
  })

  it("treats GHSA's MODERATE as medium", () => {
    expect(getAlertSeverityTier("MODERATE", null)).toBe("medium")
  })

  it("falls back to the score only when there is no recognised severity", () => {
    expect(getAlertSeverityTier(null, 9.8)).toBe("critical")
    expect(getAlertSeverityTier(null, 5)).toBe("medium")
  })

  it("is N/A with neither, or for CVSS 0.0 / NONE", () => {
    expect(getAlertSeverityTier(null, null)).toBe("na")
    expect(getAlertSeverityTier("NONE", 0)).toBe("na")
  })
})

describe("countSeverityByKey", () => {
  const alerts = [
    { assetId: "a", severity: "CRITICAL", cvssScore: 9.8 },
    { assetId: "a", severity: "HIGH", cvssScore: 10 },     // CVSS v2
    { assetId: "a", severity: "HIGH", cvssScore: 7.5 },
    { assetId: "b", severity: "LOW", cvssScore: 3.1 },
    { assetId: "b", severity: null, cvssScore: 5.3 },       // severity-less: falls back to the score
    { assetId: "b", severity: "MODERATE", cvssScore: null }, // GHSA wording, no score
    { assetId: "b", severity: null, cvssScore: null },
  ]

  it("counts each key's alerts per tier", () => {
    const byAsset = countSeverityByKey(alerts, a => a.assetId)
    expect(byAsset.get("a")).toEqual({ critical: 1, high: 2, medium: 0, low: 0, na: 0 })
    expect(byAsset.get("b")).toEqual({ critical: 0, high: 0, medium: 2, low: 1, na: 1 })
  })

  it("adds up to the Open Alert Summary built from the same alerts", () => {
    const total = countSeverity(alerts)
    const summary = buildAlertSummary(alerts.map(a => ({ severity: a.severity, cvssScore: a.cvssScore, _count: { id: 1 } })))
    expect({
      CRITICAL: total.critical, HIGH: total.high, MEDIUM: total.medium, LOW: total.low, UNKNOWN: total.na,
    }).toEqual({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, ...summary })
  })
})
