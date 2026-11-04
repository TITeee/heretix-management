import { describe, it, expect } from "vitest"
import { medianOf, sumFlows } from "./executive"
import type { Flows } from "./history"

describe("medianOf", () => {
  it("takes the middle value of the counts, or the mean of the middle two", () => {
    expect(medianOf([])).toBeNull()
    expect(medianOf([[30, 1], [10, 1], [20, 1]])).toBe(20)
    expect(medianOf([[10, 1], [40, 1]])).toBe(25)
    expect(medianOf([[5, 3], [100, 1]])).toBe(5)
    expect(medianOf([[5, 2], [100, 2]])).toBe(52.5)
  })
})

describe("sumFlows", () => {
  it("takes the median over every asset's resolutions, which the mean of a long tail overstates", () => {
    const flows = (assetId: string, spreadCritical: [number, number][]): Flows => ({
      assetId, detected: 0, resolved: 0, resolvedWithDue: 0, resolvedOnTime: 0,
      daysToResolveCritical: spreadCritical.reduce((n, [t, c]) => n + (t / 10) * c, 0),
      resolvedCritical: spreadCritical.reduce((n, [, c]) => n + c, 0),
      daysToResolveHigh: 0, resolvedHigh: 0, spreadCritical, spreadHigh: [], accepted: 0, ignoredOther: 0,
    })
    // Two assets: four resolved in 2 days, one in 100.
    const p = sumFlows([flows("a", [[20, 3]]), flows("b", [[20, 1], [1000, 1]])])
    expect(p.mttrCriticalDays).toBe(21.6)
    expect(p.medianCriticalDays).toBe(2)
    expect(p.medianHighDays).toBeNull()
  })
})
