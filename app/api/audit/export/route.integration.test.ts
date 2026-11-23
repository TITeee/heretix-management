import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import ExcelJS from "exceljs"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { AUDIT_XLSX_COLUMNS } from "@/lib/audit-export"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const admin = { user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin" } }

const get = (query: string) => GET(new NextRequest(`http://localhost/api/audit/export?${query}`))
const at = (iso: string) => new Date(iso)
const col = (header: string) => AUDIT_XLSX_COLUMNS.findIndex((c) => c.header === header) + 1

async function sheetOf(res: Response): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await res.arrayBuffer())
  return workbook.getWorksheet("Audit Log")!
}
const ids = (sheet: ExcelJS.Worksheet) => Array.from({ length: sheet.rowCount - 1 }, (_, i) => String(sheet.getRow(i + 2).getCell(col("Event ID")).value))

const exportEntries = () => prisma.auditLog.findMany({ where: { action: "audit_exported" }, orderBy: { createdAt: "asc" } })
// An export is recorded once its file is written, a moment after the response ends.
async function entriesAfter(count: number) {
  await vi.waitFor(async () => expect(await exportEntries()).toHaveLength(count))
  return exportEntries()
}

describe("GET /api/audit/export", () => {
  beforeEach(async () => {
    await resetDb()
    mockedAuth.mockResolvedValue(admin)
    await prisma.auditLog.createMany({ data: [
      { id: "a", action: "login", userEmail: "ops@example.com", detail: "IP: 10.0.0.1", createdAt: at("2026-11-01T00:00:00Z") },
      { id: "b", action: "login_failed", userEmail: "x@example.com", detail: "user not found (IP: 203.0.113.9)", createdAt: at("2026-11-02T00:00:00Z") },
      { id: "c", action: "login_failed", userEmail: "y@example.com", detail: "invalid password (IP: 203.0.113.9)", createdAt: at("2026-11-03T00:00:00Z") },
      { id: "d", action: "settings_updated", userEmail: "admin@example.com", target: null, detail: "AI_MODEL", createdAt: at("2026-11-04T00:00:00Z") },
    ] })
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("is for admins only, and says what format it takes", async () => {
    mockedAuth.mockResolvedValue({ user: { ...admin.user, role: "operator" } })
    expect((await get("format=json")).status).toBe(401)
    mockedAuth.mockResolvedValue(null)
    expect((await get("format=json")).status).toBe(401)
    mockedAuth.mockResolvedValue(admin)
    expect((await get("format=csv")).status).toBe(400)
    expect((await get("")).status).toBe(400)
    expect(await exportEntries()).toHaveLength(0)
  })

  it("writes every event of the log as JSON, newest first, and records the export", async () => {
    const res = await get("format=json")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.json"$/)
    const body = JSON.parse(await res.text())
    expect(body.map((r: { id: string }) => r.id)).toEqual(["d", "c", "b", "a"])
    expect(body[1]).toEqual({
      id: "c", time: "2026-11-03T00:00:00.000Z", user: "y@example.com", action: "login_failed", target: null, detail: "invalid password (IP: 203.0.113.9)",
    })
    const [entry] = await entriesAfter(1)
    expect(entry).toMatchObject({ userEmail: "admin@example.com", detail: "json: 4 events; filters: (none)" })
  })

  it("writes the view's filters, not its page: the actions, a search and a range of days", async () => {
    const byAction = JSON.parse(await (await get("format=json&action=login_failed")).text())
    expect(byAction.map((r: { id: string }) => r.id)).toEqual(["c", "b"])
    const bySearch = JSON.parse(await (await get("format=json&q=203.0.113&user=y@")).text())
    expect(bySearch.map((r: { id: string }) => r.id)).toEqual(["c"])
    const byDays = JSON.parse(await (await get("format=json&from=2026-11-02&to=2026-11-03&page=9&size=10")).text())
    expect(byDays.map((r: { id: string }) => r.id)).toEqual(["c", "b"])
    const entries = await entriesAfter(3)
    expect(entries.map((e) => e.detail)).toEqual([
      "json: 2 events; filters: action=login_failed",
      "json: 1 events; filters: user=y%40&q=203.0.113",
      "json: 2 events; filters: from=2026-11-02&to=2026-11-03",
    ])
  })

  it("writes an empty log as an empty array", async () => {
    const res = await get("format=json&action=no_such_action")
    expect(await res.text()).toBe("[]")
    expect((await entriesAfter(1))[0].detail).toBe("json: 0 events; filters: action=no_such_action")
  })

  it("writes the events as Excel, one row each, with the Export sheet", async () => {
    const res = await get("format=xlsx&action=login_failed")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.xlsx"$/)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await res.arrayBuffer())
    const sheet = workbook.getWorksheet("Audit Log")!
    expect(ids(sheet)).toEqual(["c", "b"])
    expect(sheet.getRow(2).getCell(col("Action")).value).toBe("Login Failed")
    expect(sheet.getRow(2).getCell(col("Date / Time (UTC)")).value).toEqual(at("2026-11-03T00:00:00Z"))
    expect(workbook.getWorksheet("Export")!.getRow(2).getCell(2).value).toBe("action=login_failed")
    expect(workbook.getWorksheet("Export")!.getRow(3).getCell(2).value).toBe(2)
    expect((await entriesAfter(1))[0].detail).toBe("xlsx: 2 events; filters: action=login_failed")
  })

  it("reads a long log in batches without losing or repeating an event, ties in time included", async () => {
    await prisma.auditLog.createMany({
      data: Array.from({ length: 4500 }, (_, i) => ({ id: `n${String(i).padStart(5, "0")}`, action: "asset_scanned", createdAt: at("2026-11-10T00:00:00Z") })),
    })
    const body = JSON.parse(await (await get("format=json&action=asset_scanned")).text()) as { id: string }[]
    expect(body).toHaveLength(4500)
    expect(new Set(body.map((r) => r.id)).size).toBe(4500)
    expect(body[0].id).toBe("n04499")
  })
})
