import { describe, it, expect } from "vitest"
import { epssChangeText, epssSide } from "./epss-change"

describe("epssChangeText", () => {
  it("shows the score next to the percentile, so a change that leaves the percentile as shown is still visible", () => {
    // A real event: 98.147 and 98.146 both read 98.1%ile.
    expect(epssChangeText({ from: 0.29601, to: 0.29499, percentileFrom: 0.98147, percentileTo: 0.98146 }))
      .toBe("0.296 (98.1%ile) → 0.295 (98.1%ile)")
  })

  it("shows the smallest recorded change (0.001) in the score", () => {
    expect(epssChangeText({ from: 0.0102, to: 0.0114, percentileFrom: 0.6, percentileTo: 0.62 }))
      .toBe("0.010 (60.0%ile) → 0.011 (62.0%ile)")
  })

  it("reads an event written before the percentile was kept", () => {
    expect(epssChangeText({ from: 0.0123, to: 0.0346 })).toBe("0.012 → 0.035")
  })

  it("shows n/a for a side that has no score", () => {
    expect(epssSide({ to: 0.5 }, "from")).toBe("n/a")
    expect(epssSide({ from: null, percentileFrom: 0.5 }, "from")).toBe("n/a (50.0%ile)")
  })

  it("ignores values that are not numbers", () => {
    expect(epssSide({ from: "0.3", percentileFrom: "high" }, "from")).toBe("n/a")
  })
})
