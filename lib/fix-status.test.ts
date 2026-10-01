import { describe, it, expect } from "vitest"
import { fixStatusLabel, fixStatusSortKey } from "./fix-status"

describe("fixStatusLabel", () => {
  it("labels the known values", () => {
    expect(fixStatusLabel("will_not_fix")).toBe("Will not fix")
    expect(fixStatusLabel("deferred")).toBe("Fix deferred")
    expect(fixStatusLabel("out_of_support")).toBe("Out of support")
  })

  it("shows an unknown value as-is rather than hiding it", () => {
    expect(fixStatusLabel("vendor_declined")).toBe("vendor_declined")
  })

  it("is null when there is no fix status", () => {
    expect(fixStatusLabel(null)).toBeNull()
    expect(fixStatusLabel(undefined)).toBeNull()
  })
})

describe("fixStatusSortKey", () => {
  it("orders from a fix may still come to no fix will come", () => {
    const sorted = ["out_of_support", "affected", "will_not_fix", "under_investigation", "deferred"]
      .sort((a, b) => fixStatusSortKey(a)! - fixStatusSortKey(b)!)
    expect(sorted).toEqual(["under_investigation", "affected", "deferred", "will_not_fix", "out_of_support"])
  })

  it("sorts an unknown value with affected, as heretix-api asks", () => {
    expect(fixStatusSortKey("vendor_declined")).toBe(fixStatusSortKey("affected"))
  })

  it("is undefined when there is no fix status", () => {
    expect(fixStatusSortKey(null)).toBeUndefined()
  })
})
