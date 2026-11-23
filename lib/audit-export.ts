/**
 * The Audit Log's exports: Excel (one row per event, written as it is read, so a large log
 * never sits in memory whole) and JSON. The view is the page's own URL parameters
 * (lib/audit-query.ts), like the Alerts export. Server-only (exceljs).
 */
import ExcelJS from "exceljs"
import type { Writable } from "node:stream"
import { auditActionLabel } from "@/lib/audit-actions"
import type { AuditListRow } from "@/lib/audit-list"
import { cellText } from "@/lib/alerts/export-xlsx"

/** Excel's last row is 1,048,576; the header takes one. */
export const AUDIT_XLSX_MAX_EVENTS = 1_048_575

const DATE_FORMAT = "yyyy-mm-dd hh:mm:ss"

type Value = string | Date | null
type Column = { header: string; width: number; value: (r: AuditListRow) => Value; numFmt?: string }

/** The columns, in order. The time is UTC, as the header says. */
export const AUDIT_XLSX_COLUMNS: Column[] = [
  { header: "Date / Time (UTC)", width: 20, value: (r) => r.createdAt, numFmt: DATE_FORMAT },
  { header: "User", width: 28, value: (r) => r.userEmail },
  { header: "Action", width: 24, value: (r) => auditActionLabel(r.action) },
  { header: "Action Code", width: 24, value: (r) => r.action },
  { header: "Target", width: 28, value: (r) => r.target },
  { header: "Detail", width: 70, value: (r) => r.detail },
  { header: "Event ID", width: 28, value: (r) => r.id },
]

/** One event as a row: text is cut at what a cell holds. exceljs stores a string as a string, so "=..." is never a formula. */
export function auditXlsxRow(r: AuditListRow): Value[] {
  return AUDIT_XLSX_COLUMNS.map((c) => {
    const v = c.value(r)
    return typeof v === "string" ? cellText(v) : v
  })
}

export type AuditXlsxInfo = {
  generatedAt: Date
  /** The page's URL parameters the view was exported with ("" for none). */
  filters: string
}

/**
 * Writes the events to `out` as an .xlsx workbook: an Audit Log sheet, then an Export sheet saying
 * when and with which filters, and how many events. Returns how many were written. Stops with an
 * error past Excel's row limit rather than writing a file that silently lost rows.
 */
export async function writeAuditXlsx(out: Writable, batches: AsyncIterable<AuditListRow[]>, info: AuditXlsxInfo): Promise<number> {
  // Shared strings would be held in memory until the end; inline strings keep it flat.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false })
  const sheet = workbook.addWorksheet("Audit Log", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = AUDIT_XLSX_COLUMNS.map((c, i) => ({
    key: String(i),
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : {},
  }))
  const header = sheet.addRow(AUDIT_XLSX_COLUMNS.map((c) => c.header))
  header.font = { bold: true }
  header.commit()
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: AUDIT_XLSX_COLUMNS.length } }

  let count = 0
  for await (const rows of batches) {
    if (count + rows.length > AUDIT_XLSX_MAX_EVENTS) {
      throw new Error(`The view has more than ${AUDIT_XLSX_MAX_EVENTS.toLocaleString("en-US")} events, more than one Excel sheet holds. Narrow it with the filters.`)
    }
    for (const r of rows) sheet.addRow(auditXlsxRow(r)).commit()
    count += rows.length
  }
  sheet.commit()

  const about = workbook.addWorksheet("Export")
  about.columns = [{ width: 18 }, { width: 100 }]
  about.addRow(["Generated (UTC)", info.generatedAt]).getCell(2).numFmt = "yyyy-mm-dd hh:mm:ss"
  about.addRow(["Filters", info.filters || "(none)"])
  about.addRow(["Events", count])
  about.commit()

  await workbook.commit()
  return count
}

/** The JSON export's record for one event; times as ISO 8601 in UTC, the action as its code. */
export function auditJsonRecord(r: AuditListRow) {
  return {
    id: r.id,
    time: new Date(r.createdAt).toISOString(),
    user: r.userEmail,
    action: r.action,
    target: r.target,
    detail: r.detail,
  }
}

/** One element of `JSON.stringify(records, null, 2)`, as it appears inside the array. */
export function auditJsonElement(r: AuditListRow): string {
  return JSON.stringify(auditJsonRecord(r), null, 2).replace(/^/gm, "  ")
}

export function auditExportFilename(ext: "xlsx" | "json", now: Date = new Date()): string {
  return `audit-log-${now.toISOString().slice(0, 10)}.${ext}`
}
