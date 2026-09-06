import { describe, it, expect } from "vitest"
import { isIgnoreReason, vexStateFor } from "./vex"

describe("isIgnoreReason", () => {
  it("accepts each known reason", () => {
    expect(isIgnoreReason("not_affected")).toBe(true)
    expect(isIgnoreReason("false_positive")).toBe(true)
    expect(isIgnoreReason("accepted_risk")).toBe(true)
  })

  it("rejects an unknown string", () => {
    expect(isIgnoreReason("wrong_package")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isIgnoreReason(null)).toBe(false)
    expect(isIgnoreReason(undefined)).toBe(false)
    expect(isIgnoreReason(42)).toBe(false)
  })
})

describe("vexStateFor", () => {
  it("returns not_affected when the reason is not_affected and a justification is present", () => {
    expect(vexStateFor({ ignoreReason: "not_affected", vexJustification: "code_not_present" })).toBe("not_affected")
  })

  it("returns null for not_affected without a justification, since that state can't be represented", () => {
    expect(vexStateFor({ ignoreReason: "not_affected", vexJustification: null })).toBeNull()
  })

  it("returns false_positive regardless of justification", () => {
    expect(vexStateFor({ ignoreReason: "false_positive", vexJustification: null })).toBe("false_positive")
  })

  it("returns null for accepted_risk, since it isn't exported as VEX", () => {
    expect(vexStateFor({ ignoreReason: "accepted_risk", vexJustification: null })).toBeNull()
  })

  it("falls back to not_affected for a legacy row that has a justification but no ignoreReason", () => {
    expect(vexStateFor({ ignoreReason: null, vexJustification: "code_not_present" })).toBe("not_affected")
  })

  it("returns null when neither ignoreReason nor vexJustification is set", () => {
    expect(vexStateFor({ ignoreReason: null, vexJustification: null })).toBeNull()
  })

  it("returns null for an unrecognized ignoreReason value", () => {
    expect(vexStateFor({ ignoreReason: "some_future_reason", vexJustification: "x" })).toBeNull()
  })
})
