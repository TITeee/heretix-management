import { describe, it, expect } from "vitest"
import { PassThrough } from "node:stream"
import ExcelJS from "exceljs"
import { ALERT_XLSX_COLUMNS, XLSX_CELL_MAX, alertXlsxRow, cellText, writeAlertsXlsx } from "./export-xlsx"
import type { Alert } from "./list-filters"

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", assetId: "s1", packageName: "libssl3", packageVersion: "3.0.2-0ubuntu1.10", ecosystem: "Ubuntu:22.04:LTS",
  externalId: "CVE-2026-0001", sources: ["osv"], cvssScore: 7.5, cvssVector: "CVSS:3.1/AV:N", severity: "HIGH",
  summary: "A summary", isKev: true, epssScore: 0.12, epssPercentile: 0.9512, approximateMatch: false,
  status: "open", notes: null, resolveReason: null, fixedVersion: "3.0.2-0ubuntu1.18", sourcePackage: "openssl",
  detectedAt: new Date("2026-10-01T00:00:00Z"), dueDate: null, updatedAt: new Date("2026-10-02T00:00:00Z"), resolvedAt: null,
  asset: { id: "s1", name: "", hostname: "host-1" }, tags: [{ id: "t1", name: "prod", color: null }],
  ...over,
})

const col = (header: string) => ALERT_XLSX_COLUMNS.findIndex((c) => c.header === header)

async function* batches(...lists: Alert[][]) { for (const l of lists) yield l }

async function write(alerts: Alert[][], timelines: Record<string, string> = {}): Promise<{ workbook: ExcelJS.Workbook; count: number }> {
  const out = new PassThrough()
  const chunks: Buffer[] = []
  out.on("data", (c) => chunks.push(c))
  const done = new Promise((resolve) => out.on("end", resolve))
  const count = await writeAlertsXlsx(out, batches(...alerts), async (ids) => new Map(ids.map((id) => [id, timelines[id] ?? ""])),
    { generatedAt: new Date("2026-11-08T00:00:00Z"), filters: "tag=t1" })
  await done
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer)
  return { workbook, count }
}

describe("alertXlsxRow", () => {
  it("writes the list's and the Overview's fields, one alert per row", () => {
    const row = alertXlsxRow(alert(), "2026-10-01 00:00 UTC Alert detected")
    expect(row).toHaveLength(ALERT_XLSX_COLUMNS.length)
    expect(row[col("Alert ID")]).toBe("a1")
    expect(row[col("Asset")]).toBe("host-1")
    expect(row[col("Source Package")]).toBe("openssl")
    expect(row[col("Severity")]).toBe("High")
    expect(row[col("Fix Available")]).toBe("Yes")
    expect(row[col("Fixed In")]).toBe("3.0.2-0ubuntu1.18")
    expect(row[col("Status")]).toBe("Open")
    expect(row[col("Timeline")]).toBe("2026-10-01 00:00 UTC Alert detected")
  })

  it("leaves empty what the alert does not have", () => {
    const row = alertXlsxRow(alert({ fixedVersion: null, ecosystem: "npm", sourcePackage: null, notes: "" }), "")
    expect(row[col("Fix Available")]).toBe("No")
    expect(row[col("Fixed In")]).toBeNull()
    expect(row[col("Source Package")]).toBeNull()
    expect(row[col("Notes")]).toBeNull()
    expect(row[col("Timeline")]).toBeNull()
  })

  it("cuts text longer than a cell holds and says so", () => {
    expect(cellText("x".repeat(XLSX_CELL_MAX))).toHaveLength(XLSX_CELL_MAX)
    const cut = cellText("x".repeat(XLSX_CELL_MAX + 10))!
    expect(cut).toHaveLength(XLSX_CELL_MAX)
    expect(cut.endsWith("(truncated)")).toBe(true)
  })
})

describe("writeAlertsXlsx", () => {
  it("writes a header, every alert of every batch, and the export's details", async () => {
    const { workbook, count } = await write([[alert()], [alert({ id: "a2", externalId: "CVE-2026-0002" })]], { a1: "line 1\nline 2" })
    expect(count).toBe(2)
    const sheet = workbook.getWorksheet("Alerts")!
    expect(sheet.rowCount).toBe(3)
    expect(sheet.getRow(1).getCell(col("Alert ID") + 1).value).toBe("Alert ID")
    expect(sheet.getRow(2).getCell(col("Alert ID") + 1).value).toBe("a1")
    expect(sheet.getRow(3).getCell(col("Vuln ID") + 1).value).toBe("CVE-2026-0002")
    expect(sheet.getRow(2).getCell(col("Timeline") + 1).value).toBe("line 1\nline 2")
    expect(sheet.getRow(2).getCell(col("CVSS Score") + 1).value).toBe(7.5)
    expect(sheet.getRow(2).getCell(col("Detected (UTC)") + 1).value).toEqual(new Date("2026-10-01T00:00:00Z"))
    const about = workbook.getWorksheet("Export")!
    expect(about.getRow(2).getCell(2).value).toBe("tag=t1")
    expect(about.getRow(3).getCell(2).value).toBe(2)
  })

  it("stores text that looks like a formula as text", async () => {
    const { workbook } = await write([[alert({ notes: "=cmd|' /C calc'!A0" })]])
    const cell = workbook.getWorksheet("Alerts")!.getRow(2).getCell(col("Notes") + 1)
    expect(cell.type).toBe(ExcelJS.ValueType.String)
    expect(cell.value).toBe("=cmd|' /C calc'!A0")
  })

  it("writes a header alone for an empty view", async () => {
    const { workbook, count } = await write([])
    expect(count).toBe(0)
    expect(workbook.getWorksheet("Alerts")!.rowCount).toBe(1)
  })
})
