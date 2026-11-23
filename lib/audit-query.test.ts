import { describe, it, expect } from "vitest"
import {
  auditQueryIsFiltered, auditQueryToSearchParams, boundToLocalDay, endOfLocalDay, isDayBound, parseAuditQuery, startOfLocalDay,
} from "./audit-query"

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

  it("tells a day from an instant", () => {
    expect(isDayBound("2026-11-22")).toBe(true)
    expect(isDayBound("2026-11-22T00:00:00.000Z")).toBe(false)
  })

  it("round-trips through the URL", () => {
    const query = parseAuditQuery({ from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T14:59:59.999Z" })
    expect(parseAuditQuery(auditQueryToSearchParams(query))).toEqual(query)
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
