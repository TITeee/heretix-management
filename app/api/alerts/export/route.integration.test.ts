import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { ALERT_XLSX_COLUMNS } from "@/lib/alerts/export-xlsx"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "operator@example.com", name: "Operator", role: "operator" } }),
}))

const get = (query: string) => GET(new NextRequest(`http://localhost/api/alerts/export?${query}`))
const col = (header: string) => ALERT_XLSX_COLUMNS.findIndex((c) => c.header === header) + 1

async function sheetOf(res: Response): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await res.arrayBuffer())
  return workbook.getWorksheet("Alerts")!
}

const idsIn = (sheet: ExcelJS.Worksheet) =>
  Array.from({ length: sheet.rowCount - 1 }, (_, i) => String(sheet.getRow(i + 2).getCell(col("Alert ID")).value)).sort()

let n = 0
const alertData = (assetId: string, over: Partial<Prisma.AlertUncheckedCreateInput> = {}): Prisma.AlertUncheckedCreateInput => ({
  assetId, packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm",
  externalId: `CVE-2026-${String(++n).padStart(4, "0")}`, sources: ["osv"], status: "open", ...over,
})

describe("GET /api/alerts/export", () => {
  let tagged = ""
  let other = ""

  beforeEach(async () => {
    await resetDb()
    const host = (name: string) => prisma.asset.create({ data: { name, hostname: name, osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" } })
    tagged = (await host("web-1")).id
    other = (await host("db-1")).id
    const tag = await prisma.tag.create({ data: { name: "Production", type: "asset" } })
    await prisma.assetTag.create({ data: { assetId: tagged, tagId: tag.id } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("writes the alerts of a tag as Excel, one row each, with their timeline", async () => {
    const a = await prisma.alert.create({ data: alertData(tagged, { fixedVersion: "4.17.21" }) })
    await prisma.alert.create({ data: alertData(other) })
    await prisma.alertEvent.createMany({ data: [
      { alertId: a.id, type: "detected", data: {}, createdAt: new Date("2026-11-01T00:00:00Z") },
      { alertId: a.id, type: "status_changed", data: { from: "open", to: "in_progress", userName: "Tanaka" }, createdAt: new Date("2026-11-02T00:00:00Z") },
    ] })
    const tagId = (await prisma.tag.findFirstOrThrow({ where: { name: "Production" } })).id

    const res = await get(`format=xlsx&tag=${tagId}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="alerts-\d{4}-\d{2}-\d{2}\.xlsx"$/)
    const sheet = await sheetOf(res)
    expect(idsIn(sheet)).toEqual([a.id])
    const row = sheet.getRow(2)
    expect(row.getCell(col("Asset")).value).toBe("web-1")
    expect(row.getCell(col("Fix Available")).value).toBe("Yes")
    expect(row.getCell(col("Timeline")).value).toBe(
      '2026-11-01 00:00 UTC Alert detected\n2026-11-02 00:00 UTC Status changed to "In Progress"; by Tanaka')
  })

  it("writes the alerts of the chosen assets, and records the export in the audit log", async () => {
    const mine = await prisma.alert.create({ data: alertData(other) })
    await prisma.alert.create({ data: alertData(tagged) })

    const res = await get(`format=xlsx&assetId=${other}`)
    expect(idsIn(await sheetOf(res))).toEqual([mine.id])
    // The log is written once the file is.
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: "alerts_exported" } })).toBe(1))
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "alerts_exported" } })
    expect(log.userEmail).toBe("operator@example.com")
    expect(log.detail).toBe(`xlsx: 1 alerts; filters: assetId=${other}`)
  })

  it("writes every alert of a grouped row on its own row", async () => {
    for (const pkg of ["libssl3", "openssl"]) {
      await prisma.alert.create({ data: alertData(tagged, { packageName: pkg, packageVersion: "3.0.2", ecosystem: "Ubuntu:22.04:LTS", sourcePackage: "openssl", externalId: "CVE-2026-9999" }) })
    }
    const sheet = await sheetOf(await get(`format=xlsx&assetId=${tagged}`))
    expect(sheet.rowCount - 1).toBe(2)
  })

  it("still writes JSON, and logs it", async () => {
    await prisma.alert.create({ data: alertData(tagged) })
    const res = await get("format=json")
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(await res.json()).toHaveLength(1)
    await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { action: "alerts_exported" } })).toBe(1))
  })

  it("no longer offers CSV, nor a missing format", async () => {
    for (const q of ["format=csv", ""]) {
      const res = await get(q)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'format must be "xlsx" or "json"' })
    }
  })
})
