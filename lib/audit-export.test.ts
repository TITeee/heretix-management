import { describe, it, expect } from "vitest"
import { PassThrough } from "node:stream"
import ExcelJS from "exceljs"
import {
  AUDIT_XLSX_COLUMNS, AUDIT_XLSX_MAX_EVENTS, auditExportFilename, auditJsonElement, auditJsonRecord, auditXlsxRow, writeAuditXlsx,
} from "./audit-export"
import { XLSX_CELL_MAX } from "./alerts/export-xlsx"
import type { AuditListRow } from "./audit-list"

const row = (over: Partial<AuditListRow> = {}): AuditListRow => ({
  id: "e1", userEmail: "admin@example.com", action: "login_failed", target: "web-01",
  detail: "invalid password (IP: 203.0.113.9)", createdAt: new Date("2026-11-23T04:15:30Z"), ...over,
})

const col = (header: string) => AUDIT_XLSX_COLUMNS.findIndex((c) => c.header === header)

async function* batches(...lists: AuditListRow[][]) { for (const l of lists) yield l }

async function write(lists: AuditListRow[][]): Promise<{ workbook: ExcelJS.Workbook; count: number }> {
  const out = new PassThrough()
  const chunks: Buffer[] = []
  out.on("data", (c) => chunks.push(c))
  const done = new Promise((resolve) => out.on("end", resolve))
  const count = await writeAuditXlsx(out, batches(...lists), { generatedAt: new Date("2026-11-24T00:00:00Z"), filters: "action=login_failed" })
  await done
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer)
  return { workbook, count }
}

describe("auditXlsxRow", () => {
  it("writes the time, who, the action as a label and as its code, the target, the detail and the id", () => {
    const r = auditXlsxRow(row())
    expect(r).toHaveLength(AUDIT_XLSX_COLUMNS.length)
    expect(r[col("Date / Time (UTC)")]).toEqual(new Date("2026-11-23T04:15:30Z"))
    expect(r[col("User")]).toBe("admin@example.com")
    expect(r[col("Action")]).toBe("Login Failed")
    expect(r[col("Action Code")]).toBe("login_failed")
    expect(r[col("Target")]).toBe("web-01")
    expect(r[col("Detail")]).toBe("invalid password (IP: 203.0.113.9)")
    expect(r[col("Event ID")]).toBe("e1")
  })

  it("leaves a missing user, target or detail empty, and words an action it has no label for", () => {
    const r = auditXlsxRow(row({ userEmail: null, target: null, detail: null, action: "report_generated" }))
    expect(r[col("User")]).toBeNull()
    expect(r[col("Target")]).toBeNull()
    expect(r[col("Detail")]).toBeNull()
    expect(r[col("Action")]).toBe("Report Generated")
  })

  it("cuts text at what a cell holds, and says so", () => {
    const cell = auditXlsxRow(row({ detail: "x".repeat(XLSX_CELL_MAX + 500) }))[col("Detail")] as string
    expect(cell).toHaveLength(XLSX_CELL_MAX)
    expect(cell.endsWith("(truncated)")).toBe(true)
  })

  it("keeps a value that looks like a formula as text", async () => {
    const { workbook } = await write([[row({ detail: "=HYPERLINK(\"http://x\")", userEmail: "+cmd@example.com" })]])
    const sheet = workbook.getWorksheet("Audit Log")!
    expect(sheet.getRow(2).getCell(col("Detail") + 1).value).toBe("=HYPERLINK(\"http://x\")")
    expect(sheet.getRow(2).getCell(col("User") + 1).value).toBe("+cmd@example.com")
  })
})

describe("writeAuditXlsx", () => {
  it("writes a header, one row per event across batches in order, and an Export sheet", async () => {
    const { workbook, count } = await write([
      [row({ id: "e3", createdAt: new Date("2026-11-23T03:00:00Z") }), row({ id: "e2", createdAt: new Date("2026-11-23T02:00:00Z") })],
      [row({ id: "e1", createdAt: new Date("2026-11-23T01:00:00Z") })],
    ])
    expect(count).toBe(3)
    const sheet = workbook.getWorksheet("Audit Log")!
    expect(sheet.rowCount).toBe(4)
    expect(sheet.getRow(1).values).toEqual([undefined, ...AUDIT_XLSX_COLUMNS.map((c) => c.header)])
    expect([2, 3, 4].map((i) => sheet.getRow(i).getCell(col("Event ID") + 1).value)).toEqual(["e3", "e2", "e1"])
    expect(sheet.getRow(2).getCell(1).value).toEqual(new Date("2026-11-23T03:00:00Z"))
    const about = workbook.getWorksheet("Export")!
    expect(about.getRow(1).getCell(2).value).toEqual(new Date("2026-11-24T00:00:00Z"))
    expect(about.getRow(2).getCell(2).value).toBe("action=login_failed")
    expect(about.getRow(3).getCell(2).value).toBe(3)
  })

  it("writes just the header for an empty view", async () => {
    const { workbook, count } = await write([])
    expect(count).toBe(0)
    expect(workbook.getWorksheet("Audit Log")!.rowCount).toBe(1)
    expect(workbook.getWorksheet("Export")!.getRow(3).getCell(2).value).toBe(0)
  })

  it("stops with an error past the rows an Excel sheet holds, instead of dropping the rest", async () => {
    const out = new PassThrough()
    out.resume()
    const tooMany = Array.from({ length: AUDIT_XLSX_MAX_EVENTS + 1 }, () => row())
    await expect(writeAuditXlsx(out, batches(tooMany), { generatedAt: new Date(), filters: "" })).rejects.toThrow(/more than 1,048,575 events/)
  })
})

describe("the JSON export", () => {
  it("writes the time as ISO 8601 in UTC and the action as its code", () => {
    expect(auditJsonRecord(row())).toEqual({
      id: "e1", time: "2026-11-23T04:15:30.000Z", user: "admin@example.com", action: "login_failed",
      target: "web-01", detail: "invalid password (IP: 203.0.113.9)",
    })
  })

  it("writes an element as JSON.stringify(records, null, 2) would inside the array", () => {
    const records = [row({ id: "a" }), row({ id: "b", userEmail: null })]
    const streamed = "[" + records.map((r, i) => (i ? ",\n" : "\n") + auditJsonElement(r)).join("") + "\n]"
    expect(streamed).toBe(JSON.stringify(records.map(auditJsonRecord), null, 2))
  })
})

describe("auditExportFilename", () => {
  it("names the file after the day, in UTC", () => {
    const at = new Date("2026-11-23T23:59:59Z")
    expect(auditExportFilename("xlsx", at)).toBe("audit-log-2026-11-23.xlsx")
    expect(auditExportFilename("json", at)).toBe("audit-log-2026-11-23.json")
  })
})
