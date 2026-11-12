import { describe, it, expect } from "vitest"
import { refreshLookupsPerMinute } from "./refresh"

// refresh.ts imports the database client, which only needs a URL to be imported.
describe("refreshLookupsPerMinute", () => {
  it("is 900 a minute, three quarters of heretix-api's default limit, unless set", () => {
    expect(refreshLookupsPerMinute(undefined)).toBe(900)
    expect(refreshLookupsPerMinute("")).toBe(900)
    expect(refreshLookupsPerMinute("  ")).toBe(900)
  })

  it("takes a whole number, and 0 to turn the pacing off", () => {
    expect(refreshLookupsPerMinute("4000")).toBe(4000)
    expect(refreshLookupsPerMinute("0")).toBe(0)
  })

  it("falls back to the default for anything else rather than pace at a wrong rate", () => {
    for (const bad of ["abc", "-5", "12.5", "NaN"]) expect(refreshLookupsPerMinute(bad)).toBe(900)
  })
})
