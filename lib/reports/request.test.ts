import { describe, it, expect } from "vitest"
import { parseReportRequest, reportSearchParams } from "./request"

const now = new Date("2026-11-03T09:00:00Z")
const parse = (query: string) => parseReportRequest(new URLSearchParams(query), now)
const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe("parseReportRequest", () => {
  it("covers the last 30 days up to now and every asset when nothing is given", () => {
    expect(parse("")).toEqual({ choice: "last_30_days", period: { from: new Date("2026-10-04T09:00:00Z"), to: now }, tagIds: [] })
    expect(parse("period=last_90_days")).toMatchObject({ period: { from: new Date("2026-08-05T09:00:00Z"), to: now } })
    expect(parse("tags=")).toMatchObject({ tagIds: [] })
  })

  it("reads a period from a first day up to now, and the chosen tags", () => {
    expect(parse("period=since&since=2026-09-15&tags=t1,t2")).toEqual({
      choice: "since", period: { from: day("2026-09-15"), to: now }, tagIds: ["t1", "t2"],
    })
  })

  it("refuses an unknown period, a past one, and a first day that is not before today", () => {
    expect(parse("period=yesterday")).toEqual({ error: "Unknown period: yesterday" })
    // The calendar periods of earlier versions: a period now always ends now.
    expect(parse("period=last_month")).toEqual({ error: "Unknown period: last_month" })
    expect(parse("period=since&since=2026-11-03")).toEqual({ error: "The first day must be before today" })
    expect(parse("period=since")).toEqual({ error: "The first day must be written YYYY-MM-DD" })
    expect(parse("period=since&since=2024-01-01")).toEqual({ error: "A report covers at most 731 days" })
  })

  it("is read back from the parameters it writes", () => {
    for (const query of ["period=last_90_days", "period=since&since=2026-09-15&tags=t1", "period=last_30_days&tags=t1,t2"]) {
      const request = parse(query)
      if ("error" in request) throw new Error(request.error)
      expect(reportSearchParams(request).toString()).toBe(new URLSearchParams(query).toString())
    }
  })
})
