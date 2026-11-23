import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { allAuditRows, auditActionNames, listAuditPage } from "./audit-list"
import { parseAuditQuery } from "./audit-query"

const query = (params: Record<string, string> = {}) => parseAuditQuery(params)
const at = (iso: string) => new Date(iso)
const log = (action: string, createdAt: string, extra: { userEmail?: string; target?: string; detail?: string } = {}) =>
  prisma.auditLog.create({ data: { action, createdAt: at(createdAt), ...extra } })

describe("listAuditPage", () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("lists the newest first, and ties in a fixed order", async () => {
    await log("a", "2026-11-01T10:00:00Z")
    await log("b", "2026-11-03T10:00:00Z")
    await log("c", "2026-11-02T10:00:00Z")
    const same = "2026-11-04T10:00:00Z"
    await prisma.auditLog.createMany({ data: [{ id: "x1", action: "t1", createdAt: at(same) }, { id: "x2", action: "t2", createdAt: at(same) }] })
    const { rows, total } = await listAuditPage(query())
    expect(total).toBe(5)
    expect(rows.map((r) => r.action)).toEqual(["t2", "t1", "b", "c", "a"])
  })

  it("pages through the whole log, and shows the last page for one past the end", async () => {
    await prisma.auditLog.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({ action: `n${String(i).padStart(2, "0")}`, createdAt: at(`2026-11-01T00:${String(i).padStart(2, "0")}:00Z`) })),
    })
    const first = await listAuditPage(query({ size: "10" }))
    expect(first).toMatchObject({ total: 25, page: 1 })
    expect(first.rows.map((r) => r.action)[0]).toBe("n24")
    const second = await listAuditPage(query({ size: "10", page: "2" }))
    expect(second.rows.map((r) => r.action)).toEqual(["n14", "n13", "n12", "n11", "n10", "n09", "n08", "n07", "n06", "n05"])
    const third = await listAuditPage(query({ size: "10", page: "3" }))
    expect(third.rows.map((r) => r.action)).toEqual(["n04", "n03", "n02", "n01", "n00"])
    const past = await listAuditPage(query({ size: "10", page: "99" }))
    expect(past.page).toBe(3)
    expect(past.rows).toHaveLength(5)
  })

  it("answers an empty log with an empty first page", async () => {
    expect(await listAuditPage(query({ page: "5" }))).toEqual({ rows: [], total: 0, page: 1 })
  })

  it("filters by action, one or several", async () => {
    await log("login", "2026-11-01T00:00:00Z")
    await log("login_failed", "2026-11-01T00:01:00Z")
    await log("settings_updated", "2026-11-01T00:02:00Z")
    expect((await listAuditPage(query({ action: "login_failed" }))).rows.map((r) => r.action)).toEqual(["login_failed"])
    expect((await listAuditPage(query({ action: "login,settings_updated" }))).total).toBe(2)
    expect((await listAuditPage(query({ action: "no_such_action" }))).total).toBe(0)
  })

  it("searches the user's email, and the target or the detail, ignoring case", async () => {
    await log("a", "2026-11-01T00:00:00Z", { userEmail: "Admin@Example.com", target: "web-01", detail: "packages: 12" })
    await log("b", "2026-11-01T00:01:00Z", { userEmail: "ops@example.com", target: "db-01", detail: "user not found (IP: 203.0.113.9)" })
    expect((await listAuditPage(query({ user: "admin@" }))).rows.map((r) => r.action)).toEqual(["a"])
    expect((await listAuditPage(query({ q: "WEB-01" }))).rows.map((r) => r.action)).toEqual(["a"])
    expect((await listAuditPage(query({ q: "203.0.113" }))).rows.map((r) => r.action)).toEqual(["b"])
    expect((await listAuditPage(query({ q: "01" }))).total).toBe(2)
    expect((await listAuditPage(query({ user: "example.com", q: "db-01" }))).rows.map((r) => r.action)).toEqual(["b"])
  })

  it("takes % and _ in a search as the characters they are", async () => {
    await log("pct", "2026-11-01T00:00:00Z", { detail: "disk 100% full" })
    await log("other", "2026-11-01T00:01:00Z", { detail: "disk 1000 full" })
    await log("under", "2026-11-01T00:02:00Z", { detail: "a_b" })
    await log("plain", "2026-11-01T00:03:00Z", { detail: "axb" })
    expect((await listAuditPage(query({ q: "100%" }))).rows.map((r) => r.action)).toEqual(["pct"])
    expect((await listAuditPage(query({ q: "%" }))).rows.map((r) => r.action)).toEqual(["pct"])
    expect((await listAuditPage(query({ q: "a_b" }))).rows.map((r) => r.action)).toEqual(["under"])
  })

  it("takes a backslash in a search as a backslash", async () => {
    await log("path", "2026-11-01T00:00:00Z", { detail: "C:\\temp\\x" })
    await log("other", "2026-11-01T00:01:00Z", { detail: "C:temp" })
    expect((await listAuditPage(query({ q: "C:\\temp" }))).rows.map((r) => r.action)).toEqual(["path"])
    expect((await listAuditPage(query({ q: "\\" }))).rows.map((r) => r.action)).toEqual(["path"])
  })

  it("takes a range of UTC days, both ends included", async () => {
    await log("before", "2026-11-09T23:59:59Z")
    await log("first", "2026-11-10T00:00:00Z")
    await log("middle", "2026-11-11T12:00:00Z")
    await log("last", "2026-11-12T23:59:59Z")
    await log("after", "2026-11-13T00:00:00Z")
    const between = await listAuditPage(query({ from: "2026-11-10", to: "2026-11-12" }))
    expect(between.rows.map((r) => r.action)).toEqual(["last", "middle", "first"])
    expect((await listAuditPage(query({ from: "2026-11-12" }))).rows.map((r) => r.action)).toEqual(["after", "last"])
    expect((await listAuditPage(query({ to: "2026-11-10" }))).rows.map((r) => r.action)).toEqual(["first", "before"])
    expect((await listAuditPage(query({ from: "2026-11-12", to: "2026-11-10" }))).total).toBe(0)
  })

  it("takes instants as they are, so a day of the user's own time zone can be asked for", async () => {
    // 2026-11-23 in Japan (UTC+9) is 2026-11-22T15:00:00Z up to 2026-11-23T14:59:59.999Z.
    await log("before", "2026-11-22T14:59:59Z")
    await log("start", "2026-11-22T15:00:00Z")
    await log("end", "2026-11-23T14:59:59Z")
    await log("after", "2026-11-23T15:00:00Z")
    const day = await listAuditPage(query({ from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T14:59:59.999Z" }))
    expect(day.rows.map((r) => r.action)).toEqual(["end", "start"])
    expect((await listAuditPage(query({ from: "2026-11-23T14:59:59.000Z" }))).rows.map((r) => r.action)).toEqual(["after", "end"])
    expect((await listAuditPage(query({ to: "2026-11-22T15:00:00.000Z" }))).rows.map((r) => r.action)).toEqual(["start", "before"])
  })

  it("counts and pages what the filters leave, not the whole log", async () => {
    await prisma.auditLog.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ action: i % 3 === 0 ? "login_failed" : "login", createdAt: at("2026-11-01T00:00:00Z") })) })
    const page = await listAuditPage(query({ action: "login_failed", size: "10" }))
    expect(page.total).toBe(10)
    expect(page.rows).toHaveLength(10)
    expect((await listAuditPage(query({ action: "login_failed", size: "10", page: "2" }))).page).toBe(1)
  })
})

describe("allAuditRows", () => {
  beforeEach(async () => {
    await resetDb()
  })

  it("reads every row a query selects, in the list's order, in batches of the size asked for", async () => {
    // Ties in time are what a cursor has to get right: ten rows, four moments.
    for (let i = 0; i < 10; i++) await log(i % 2 ? "odd" : "even", `2026-11-0${1 + (i % 4)}T00:00:00Z`)
    const all: string[] = []
    const sizes: number[] = []
    for await (const batch of allAuditRows(query(), 3)) {
      sizes.push(batch.length)
      all.push(...batch.map((r) => r.id))
    }
    expect(sizes).toEqual([3, 3, 3, 1])
    const listed = (await listAuditPage(query({ size: "50" }))).rows.map((r) => r.id)
    expect(all).toEqual(listed)

    const odd: string[] = []
    for await (const batch of allAuditRows(query({ action: "odd" }), 2)) odd.push(...batch.map((r) => r.action))
    expect(odd).toEqual(["odd", "odd", "odd", "odd", "odd"])
  })

  it("ends cleanly when the rows fill the last batch exactly, and when there are none", async () => {
    for (let i = 0; i < 6; i++) await log("a", "2026-11-01T00:00:00Z")
    const sizes: number[] = []
    for await (const batch of allAuditRows(query(), 3)) sizes.push(batch.length)
    expect(sizes).toEqual([3, 3])
    const none: number[] = []
    for await (const batch of allAuditRows(query({ action: "zzz" }), 3)) none.push(batch.length)
    expect(none).toEqual([])
  })
})

describe("auditActionNames", () => {
  beforeEach(async () => {
    await resetDb()
  })

  it("lists each action the log holds once, in order", async () => {
    await log("login", "2026-11-01T00:00:00Z")
    await log("asset_scanned", "2026-11-01T00:01:00Z")
    await log("login", "2026-11-01T00:02:00Z")
    expect(await auditActionNames()).toEqual(["asset_scanned", "login"])
  })
})
