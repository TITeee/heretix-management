import { describe, it, expect } from "vitest"
import { formatDay, lastDay, parsePeriod, periodDays, presetPeriod, previousPeriod, trendPoints } from "./period"

const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe("presetPeriod", () => {
  it("gives the last whole month, and the last three, before the current one", () => {
    const now = new Date("2026-11-03T05:00:00Z")
    expect(presetPeriod("last_month", now)).toEqual({ from: day("2026-10-01"), to: day("2026-11-01") })
    expect(presetPeriod("last_3_months", now)).toEqual({ from: day("2026-08-01"), to: day("2026-11-01") })
  })

  it("crosses the year in January", () => {
    expect(presetPeriod("last_month", new Date("2027-01-15T00:00:00Z"))).toEqual({ from: day("2026-12-01"), to: day("2027-01-01") })
  })
})

describe("parsePeriod", () => {
  it("includes the last day", () => {
    expect(parsePeriod("2026-10-01", "2026-10-31")).toEqual({ from: day("2026-10-01"), to: day("2026-11-01") })
    expect(parsePeriod("2026-10-05", "2026-10-05")).toEqual({ from: day("2026-10-05"), to: day("2026-10-06") })
  })

  it("refuses what is not a real date, a reversed period and one that is too long", () => {
    expect(parsePeriod("2026-02-30", "2026-03-01")).toHaveProperty("error")
    expect(parsePeriod("2026/10/01", "2026-10-31")).toHaveProperty("error")
    expect(parsePeriod("2026-10-31", "2026-10-01")).toHaveProperty("error")
    expect(parsePeriod("2024-01-01", "2026-10-31")).toHaveProperty("error")
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

  it("leaves out moments after now", () => {
    expect(trendPoints({ from: day("2026-11-01"), to: day("2026-12-01") }, new Date("2026-11-10T12:00:00Z")).map(formatDay))
      .toEqual(["2026-11-01", "2026-11-08"])
  })
})

describe("lastDay", () => {
  it("is the day before the end", () => {
    expect(formatDay(lastDay({ from: day("2026-10-01"), to: day("2026-11-01") }))).toBe("2026-10-31")
  })
})
