import { describe, it, expect } from "vitest"
import { auditQueryIsFiltered, auditQueryToSearchParams, parseAuditQuery } from "./audit-query"

describe("parseAuditQuery", () => {
  it("defaults to the first page of 25 with no filter", () => {
    expect(parseAuditQuery({})).toEqual({ page: 1, pageSize: 25, actions: [], user: null, q: null, from: null, to: null })
  })

  it("reads every parameter, from a record or from URLSearchParams", () => {
    const expected = { page: 3, pageSize: 50, actions: ["login_failed", "settings_updated"], user: "admin", q: "10.0.0.1", from: "2026-11-01", to: "2026-11-23" }
    const raw = { page: "3", size: "50", action: "login_failed,settings_updated", user: "admin", q: "10.0.0.1", from: "2026-11-01", to: "2026-11-23" }
    expect(parseAuditQuery(raw)).toEqual(expected)
    expect(parseAuditQuery(new URLSearchParams(raw))).toEqual(expected)
  })

  it("falls back for a page or size that is not usable", () => {
    expect(parseAuditQuery({ page: "0" }).page).toBe(1)
    expect(parseAuditQuery({ page: "-4" }).page).toBe(1)
    expect(parseAuditQuery({ page: "abc" }).page).toBe(1)
    expect(parseAuditQuery({ page: "2.9" }).page).toBe(2)
    expect(parseAuditQuery({ size: "1000" }).pageSize).toBe(25)
    expect(parseAuditQuery({ size: "15" }).pageSize).toBe(15)
  })

  it("keeps only action names that can be one, once each, and a bounded number of them", () => {
    expect(parseAuditQuery({ action: "login, login ,bad name,UPPER,a;b,,settings_updated" }).actions).toEqual(["login", "settings_updated"])
    expect(parseAuditQuery({ action: Array.from({ length: 50 }, (_, i) => `a${i}`).join(",") }).actions).toHaveLength(30)
    expect(parseAuditQuery({ action: ["login", "login_failed"] }).actions).toEqual(["login", "login_failed"])
  })

  it("trims the searches, drops an empty one and cuts a long one", () => {
    expect(parseAuditQuery({ user: "  a@example.com  ", q: "   " })).toMatchObject({ user: "a@example.com", q: null })
    expect(parseAuditQuery({ q: "x".repeat(5000) }).q).toHaveLength(200)
  })

  it("ignores a day that is not a real calendar day", () => {
    expect(parseAuditQuery({ from: "2026-02-30", to: "2026-13-01" })).toMatchObject({ from: null, to: null })
    expect(parseAuditQuery({ from: "11/01/2026", to: "yesterday" })).toMatchObject({ from: null, to: null })
    expect(parseAuditQuery({ from: " 2026-02-28 " }).from).toBe("2026-02-28")
    expect(parseAuditQuery({ from: "2028-02-29" }).from).toBe("2028-02-29")
  })
})

describe("from and to as instants", () => {
  it("reads an ISO instant, written out in full in UTC", () => {
    expect(parseAuditQuery({ from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T14:59:59.999Z" })).toMatchObject({
      from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T14:59:59.999Z",
    })
    expect(parseAuditQuery({ from: "2026-11-22T15:00:00Z" }).from).toBe("2026-11-22T15:00:00.000Z")
  })

  it("ignores an instant that is not one", () => {
    for (const bad of ["2026-11-22T25:00:00Z", "2026-11-22T15:00:00+09:00", "2026-11-22 15:00:00Z", "2026-02-30T00:00:00Z", "2026-11-22T15:00Z"]) {
      expect(parseAuditQuery({ from: bad }).from).toBeNull()
    }
  })

  it("round-trips through the URL", () => {
    const query = parseAuditQuery({ from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T14:59:59.999Z" })
    expect(parseAuditQuery(auditQueryToSearchParams(query))).toEqual(query)
  })
})

describe("auditQueryToSearchParams", () => {
  it("leaves out what is the default, so the plain log has a plain URL", () => {
    expect(auditQueryToSearchParams(parseAuditQuery({})).toString()).toBe("")
    expect(auditQueryToSearchParams(parseAuditQuery({ page: "1", size: "25" })).toString()).toBe("")
  })

  it("round-trips a query", () => {
    const query = parseAuditQuery({ page: "4", size: "10", action: "login,login_failed", user: "a@b.c", q: "IP: 1.2.3.4", from: "2026-11-01", to: "2026-11-30" })
    expect(parseAuditQuery(auditQueryToSearchParams(query))).toEqual(query)
  })
})

describe("auditQueryIsFiltered", () => {
  it("is true for a filter or a search, not for a page or its size", () => {
    expect(auditQueryIsFiltered(parseAuditQuery({ page: "3", size: "50" }))).toBe(false)
    for (const p of [{ action: "login" }, { user: "a" }, { q: "a" }, { from: "2026-11-01" }, { to: "2026-11-01" }]) {
      expect(auditQueryIsFiltered(parseAuditQuery(p))).toBe(true)
    }
  })
})
