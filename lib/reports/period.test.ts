import { describe, it, expect } from "vitest"
import { parseSince, periodDays, presetPeriod, previousPeriod, trendPoints, formatDay } from "./period"

const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe("presetPeriod", () => {
  it("gives the last 30 or 90 days, up to now", () => {
    const now = new Date("2026-11-03T05:00:00Z")
    expect(presetPeriod("last_30_days", now)).toEqual({ from: new Date("2026-10-04T05:00:00Z"), to: now })
    expect(periodDays(presetPeriod("last_90_days", now))).toBe(90)
  })
})

describe("parseSince", () => {
  const now = new Date("2026-11-03T05:00:00Z")

  it("runs from the start of the day up to now", () => {
    expect(parseSince("2026-10-01", now)).toEqual({ from: day("2026-10-01"), to: now })
    expect(parseSince("2026-11-02", now)).toEqual({ from: day("2026-11-02"), to: now })
  })

  it("refuses what is not a real date, today or later, and a period that is too long", () => {
    expect(parseSince("2026-02-30", now)).toHaveProperty("error")
    expect(parseSince("2026/10/01", now)).toHaveProperty("error")
    expect(parseSince("2026-11-03", now)).toHaveProperty("error")
    expect(parseSince("2024-01-01", now)).toHaveProperty("error")
  })
})

describe("previousPeriod", () => {
  it("is the same length, ending where the period starts", () => {
    const period = { from: day("2026-10-01"), to: day("2026-11-01") }
    const previous = previousPeriod(period)
    expect(previous).toEqual({ from: day("2026-08-31"), to: day("2026-10-01") })
    expect(periodDays(previous)).toBe(periodDays(period))
  })
})

describe("trendPoints", () => {
  const now = day("2027-01-01")

  it("is weekly up to about three months, with both ends", () => {
    expect(trendPoints({ from: day("2026-10-01"), to: day("2026-11-01") }, now).map(formatDay)).toEqual([
      "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29", "2026-11-01",
    ])
  })

  it("is monthly beyond that", () => {
    expect(trendPoints({ from: day("2026-05-15"), to: day("2026-11-01") }, now).map(formatDay)).toEqual([
      "2026-05-15", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01",
    ])
  })

  it("ends a period still running at now, leaving out the moments after it", () => {
    const now = new Date("2026-11-10T12:00:00Z")
    expect(trendPoints({ from: day("2026-11-01"), to: day("2026-12-01") }, now))
      .toEqual([day("2026-11-01"), day("2026-11-08"), now])
    expect(trendPoints({ from: day("2026-12-01"), to: day("2027-01-01") }, now)).toEqual([])
  })
})
