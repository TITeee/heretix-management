import { describe, it, expect } from "vitest"
import { cutExplanation, cutLabel } from "./findings-cut"

describe("cutLabel", () => {
  it("says how many of the matched findings were returned", () => {
    expect(cutLabel({ findingsMatched: 6122, findingsReturned: 5000 })).toBe("5,000 of 6,122")
  })

  it("says \"at least\" when heretix-api did not give the total", () => {
    expect(cutLabel({ findingsMatched: null, findingsReturned: 500 })).toBe("at least 500")
    expect(cutLabel({ findingsMatched: null, findingsReturned: null })).toBe("cut")
  })
})

describe("cutExplanation", () => {
  it("counts the findings that are not alerts", () => {
    expect(cutExplanation({ findingsMatched: 6122, findingsReturned: 5000 })).toContain("1,122 are not alerts")
  })

  it("still says some are missing when the total is unknown", () => {
    expect(cutExplanation({ findingsMatched: null, findingsReturned: 500 })).toContain("some are not alerts")
  })
})
