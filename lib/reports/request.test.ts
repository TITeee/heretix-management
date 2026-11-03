import { describe, it, expect } from "vitest"
import { parseReportRequest, reportSearchParams } from "./request"

const now = new Date("2026-11-03T09:00:00Z")
const parse = (query: string) => parseReportRequest(new URLSearchParams(query), now)
const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe("parseReportRequest", () => {
  it("covers last month and every asset when nothing is given", () => {
    expect(parse("")).toEqual({ choice: "last_month", period: { from: day("2026-10-01"), to: day("2026-11-01") }, tagIds: [] })
    expect(parse("tags=")).toMatchObject({ tagIds: [] })
  })

  it("reads a custom period with its last day included, and the chosen tags", () => {
    expect(parse("period=custom&from=2026-09-15&to=2026-10-14&tags=t1,t2")).toEqual({
      choice: "custom", period: { from: day("2026-09-15"), to: day("2026-10-15") }, tagIds: ["t1", "t2"],
    })
  })

  it("refuses an unknown period and a custom one that is not a period", () => {
    expect(parse("period=yesterday")).toEqual({ error: "Unknown period: yesterday" })
    expect(parse("period=custom&from=2026-10-14&to=2026-09-15")).toEqual({ error: "The last day is before the first" })
    expect(parse("period=custom")).toEqual({ error: "Dates must be written YYYY-MM-DD" })
  })

  it("is read back from the parameters it writes", () => {
    for (const query of ["period=last_3_months", "period=custom&from=2026-09-15&to=2026-10-14&tags=t1", "period=last_month&tags=t1,t2"]) {
      const request = parse(query)
      if ("error" in request) throw new Error(request.error)
      expect(reportSearchParams(request).toString()).toBe(new URLSearchParams(query).toString())
    }
  })
})
