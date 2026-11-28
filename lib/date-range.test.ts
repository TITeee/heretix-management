import { describe, it, expect } from "vitest"
import { boundToLocalDay, dateRangeInstants, endOfLocalDay, isDayBound, parseDateBound, startOfLocalDay } from "./date-range"

describe("parseDateBound", () => {
  it("reads a real calendar day and an instant, and nothing else", () => {
    expect(parseDateBound("2026-11-22")).toBe("2026-11-22")
    expect(parseDateBound(" 2028-02-29 ")).toBe("2028-02-29")
    expect(parseDateBound("2026-11-22T15:00:00Z")).toBe("2026-11-22T15:00:00.000Z")
    for (const bad of [undefined, "", "2026-02-30", "2026-13-01", "11/01/2026", "yesterday", "2026-11-22T25:00:00Z", "2026-11-22T15:00:00+09:00", "2026-11-22T15:00Z"]) {
      expect(parseDateBound(bad)).toBeNull()
    }
  })

  it("tells a day from an instant", () => {
    expect(isDayBound("2026-11-22")).toBe(true)
    expect(isDayBound("2026-11-22T00:00:00.000Z")).toBe(false)
  })
})

describe("dateRangeInstants", () => {
  it("takes a day end as the whole UTC day, both ends included", () => {
    const r = dateRangeInstants("2026-11-10", "2026-11-12")
    expect(r.from?.toISOString()).toBe("2026-11-10T00:00:00.000Z")
    expect(r.toExclusive?.toISOString()).toBe("2026-11-13T00:00:00.000Z")
  })

  it("includes an instant end, which is the millisecond after it as an exclusive end", () => {
    const r = dateRangeInstants("2026-11-22T15:00:00.000Z", "2026-11-23T14:59:59.999Z")
    expect(r.from?.toISOString()).toBe("2026-11-22T15:00:00.000Z")
    expect(r.toExclusive?.toISOString()).toBe("2026-11-23T15:00:00.000Z")
  })

  it("leaves an open end open", () => {
    expect(dateRangeInstants(null, null)).toEqual({ from: null, toExclusive: null })
    expect(dateRangeInstants("2026-11-10", null).toExclusive).toBeNull()
    expect(dateRangeInstants(null, "2026-11-10").from).toBeNull()
  })
})

describe("local days", () => {
  // Whatever time zone the tests run in: the bounds of a local day are on that day, and bracket it.
  const noon = new Date(2026, 10, 23, 12, 0, 0)

  it("starts and ends the day the user picked, in their own time zone", () => {
    const start = new Date(startOfLocalDay(noon))
    const end = new Date(endOfLocalDay(noon))
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toEqual([2026, 10, 23, 0, 0])
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([2026, 10, 23, 23, 59, 59])
    expect(start.getTime()).toBeLessThan(noon.getTime())
    expect(noon.getTime()).toBeLessThan(end.getTime())
  })

  it("gives the calendar back the day it was given", () => {
    for (const day of [noon, new Date(2026, 0, 1), new Date(2026, 11, 31)]) {
      for (const value of [startOfLocalDay(day), endOfLocalDay(day)]) {
        const back = boundToLocalDay(value)
        expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([day.getFullYear(), day.getMonth(), day.getDate()])
      }
    }
    const fromLink = boundToLocalDay("2026-11-10")
    expect([fromLink.getFullYear(), fromLink.getMonth(), fromLink.getDate()]).toEqual([2026, 10, 10])
  })
})

