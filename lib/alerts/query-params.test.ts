import { describe, it, expect } from "vitest"
import { parseAlertQuery, alertQueryToSearchParams, DEFAULT_STATUSES } from "./query-params"

describe("parseAlertQuery", () => {
  it("defaults to the first page of 10, newest first, open and in-progress alerts", () => {
    const q = parseAlertQuery({})
    expect(q.page).toBe(1)
    expect(q.pageSize).toBe(10)
    expect(q.sort).toEqual({ column: "detectedAt", desc: true })
    expect(q.statuses).toEqual(DEFAULT_STATUSES)
    expect(q.assetIds).toEqual([])
  })

  it("keeps the meaning of the links other screens build", () => {
    // Asset page severity badge
    expect(parseAlertQuery({ assetId: "a1", severity: "HIGH" })).toMatchObject({ assetIds: ["a1"], severityTiers: ["high"] })
    expect(parseAlertQuery({ assetId: "a1", severity: "UNKNOWN" })).toMatchObject({ severityTiers: ["na"] })
    // Asset page KEV badge
    expect(parseAlertQuery({ assetId: "a1", kev: "1" })).toMatchObject({ risks: ["kev"] })
    // Asset packages table
    expect(parseAlertQuery({ assetId: "a1", packageName: "openssl", packageVersion: "1:3.5.8-2.el9_8" }))
      .toMatchObject({ packageName: "openssl", packageVersion: "1:3.5.8-2.el9_8", q: null })
    // Dashboard critical packages card
    expect(parseAlertQuery({ packageName: "lodash" })).toMatchObject({ packageName: "lodash", q: null })
  })

  it("reads a status link, and an empty status as every status", () => {
    expect(parseAlertQuery({ status: "resolved" }).statuses).toEqual(["resolved"])
    expect(parseAlertQuery({ status: "" }).statuses).toEqual([])
  })

  it("reads comma-separated and repeated values, dropping unknown ones", () => {
    const q = parseAlertQuery({ severity: "critical,HIGH,bogus", risk: "kev,malware,x", due: "overdue,soon", dependency: ["direct", "indirect"] })
    expect(q.severityTiers).toEqual(["critical", "high"])
    expect(q.risks).toEqual(["kev", "malware"])
    expect(q.dues).toEqual(["overdue"])
    expect(q.dependencies).toEqual(["direct", "indirect"])
  })

  it("falls back to the defaults for a bad page, size or sort", () => {
    const q = parseAlertQuery({ page: "-3", size: "1000", sort: "summary", dir: "asc" })
    expect(q.page).toBe(1)
    expect(q.pageSize).toBe(10)
    expect(q.sort).toEqual({ column: "detectedAt", desc: true })
  })

  it("reads a sort and its direction", () => {
    expect(parseAlertQuery({ sort: "cvssScore", dir: "asc" }).sort).toEqual({ column: "cvssScore", desc: false })
    expect(parseAlertQuery({ sort: "cvssScore" }).sort).toEqual({ column: "cvssScore", desc: true })
  })

  it("reads URLSearchParams too", () => {
    expect(parseAlertQuery(new URLSearchParams("assetId=a1,a2&q=kernel")).assetIds).toEqual(["a1", "a2"])
  })
})

describe("alertQueryToSearchParams", () => {
  it("leaves out the defaults", () => {
    expect(alertQueryToSearchParams(parseAlertQuery({})).toString()).toBe("")
  })

  it("round-trips through parseAlertQuery", () => {
    const params = {
      assetId: "a1,a2", status: "resolved", severity: "critical,na", risk: "malware", ecosystem: "Red Hat:9",
      source: "osv", tag: "t1", dependency: "direct", inventory: "missing", due: "overdue", distro: "Red Hat: low,none",
      fixStatus: "deferred", packageName: "openssl", packageVersion: "1.0", q: "kern", vuln: "CVE-2026",
      sort: "epssScore", dir: "asc", size: "25", page: "3",
    }
    const q = parseAlertQuery(params)
    expect(parseAlertQuery(alertQueryToSearchParams(q))).toEqual(q)
  })

  it("writes kev=1 links back as the risk filter", () => {
    expect(alertQueryToSearchParams(parseAlertQuery({ kev: "1" })).toString()).toBe("risk=kev")
  })
})
