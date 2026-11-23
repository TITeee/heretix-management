import { describe, it, expect } from "vitest"
import { AUDIT_MIN_DAYS, SCAN_HISTORY_MIN_DAYS, RETENTION_KEYS, effectiveDays, retentionProblem } from "./retention"

const { audit: AUDIT, scan: SCAN } = RETENTION_KEYS

describe("retentionProblem", () => {
  it("accepts an empty value (keep everything) and a period at or above the floor", () => {
    expect(retentionProblem(AUDIT, "")).toBeNull()
    expect(retentionProblem(AUDIT, "  ")).toBeNull()
    expect(retentionProblem(AUDIT, String(AUDIT_MIN_DAYS))).toBeNull()
    expect(retentionProblem(AUDIT, "365")).toBeNull()
    expect(retentionProblem(SCAN, String(SCAN_HISTORY_MIN_DAYS))).toBeNull()
  })

  it("refuses a period below the floor, so recent history cannot be erased from the page", () => {
    expect(retentionProblem(AUDIT, String(AUDIT_MIN_DAYS - 1))).toContain(`at least ${AUDIT_MIN_DAYS} days`)
    expect(retentionProblem(AUDIT, "0")).toContain("at least")
    expect(retentionProblem(SCAN, String(SCAN_HISTORY_MIN_DAYS - 1))).toContain(`at least ${SCAN_HISTORY_MIN_DAYS} days`)
  })

  it("refuses what is not a whole number of days", () => {
    for (const bad of ["abc", "-90", "90.5", "9e2", "1 0 0", "99999999"]) {
      expect(retentionProblem(AUDIT, bad)).toContain("whole number of days")
    }
  })

  it("has nothing to say about other settings", () => {
    expect(retentionProblem("SLACK_ENABLED", "true")).toBeNull()
  })
})

describe("effectiveDays", () => {
  it("keeps everything unless a number is stored", () => {
    expect(effectiveDays(AUDIT, undefined)).toBeNull()
    expect(effectiveDays(AUDIT, "")).toBeNull()
    expect(effectiveDays(AUDIT, "forever")).toBeNull()
  })

  it("never goes below the floor, even if the stored value was written around the API", () => {
    expect(effectiveDays(AUDIT, "7")).toBe(AUDIT_MIN_DAYS)
    expect(effectiveDays(AUDIT, "0")).toBe(AUDIT_MIN_DAYS)
    expect(effectiveDays(SCAN, "1")).toBe(SCAN_HISTORY_MIN_DAYS)
    expect(effectiveDays(AUDIT, "400")).toBe(400)
  })
})
