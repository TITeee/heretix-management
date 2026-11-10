/**
 * The Alerts list's Excel export: one row per alert, every column of the list
 * and of the alert panel's Overview, and the alert's timeline as text in its
 * last column. Written with exceljs's streaming writer, so a view of hundreds
 * of thousands of alerts is written as it is read and never held whole.
 * Server-only (exceljs).
 */
import ExcelJS from "exceljs"
import type { Writable } from "node:stream"
import type { Alert } from "@/lib/alerts/list-filters"
import { getAlertSeverityTier, STATUS_LABELS } from "@/lib/severity"
import { fixStatusLabel } from "@/lib/fix-status"
import { distroPriorityLabel } from "@/lib/distro-priority"
import { IGNORE_REASONS, isIgnoreReason } from "@/lib/vex"
import { sourcePackageToShow } from "@/lib/remediation"

/** The most text an Excel cell holds; a longer value is cut and says so. */
export const XLSX_CELL_MAX = 32767
const TRUNCATED = " … (truncated)"

/** Excel's last row is 1,048,576; the header takes one. */
export const XLSX_MAX_ALERTS = 1_048_575

const TIER_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", na: "N/A" } as const
const DATE_FORMAT = "yyyy-mm-dd hh:mm"

type Value = string | number | Date | null

type Column = {
  header: string
  width: number
  value: (a: Alert, timeline: string) => Value
  numFmt?: string
  wrap?: boolean
}

const yesNo = (v: boolean | null | undefined): string => (v ? "Yes" : "No")
const date = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null)

/** Text as Excel can hold it: at most XLSX_CELL_MAX characters. */
export function cellText(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  return value.length > XLSX_CELL_MAX ? value.slice(0, XLSX_CELL_MAX - TRUNCATED.length) + TRUNCATED : value
}

/** The columns, in order. Dates are UTC, as the headers say. */
export const ALERT_XLSX_COLUMNS: Column[] = [
  { header: "Alert ID", width: 28, value: (a) => a.id },
  { header: "Vuln ID", width: 20, value: (a) => a.externalId },
  { header: "Asset", width: 24, value: (a) => a.asset.name || a.asset.hostname },
  { header: "Hostname", width: 24, value: (a) => a.asset.hostname },
  { header: "Tags", width: 24, value: (a) => a.tags.map((t) => t.name).join(", ") },
  { header: "Package", width: 28, value: (a) => a.packageName },
  { header: "Version", width: 20, value: (a) => a.packageVersion },
  { header: "Source Package", width: 22, value: (a) => sourcePackageToShow({ name: a.packageName, ecosystem: a.ecosystem, sourcePackage: a.sourcePackage }) },
  { header: "Ecosystem", width: 18, value: (a) => a.ecosystem || "Other" },
  { header: "Component", width: 22, value: (a) => a.component ?? null },
  { header: "Dependency", width: 12, value: (a) => (a.packageDirect === true ? "Direct" : a.packageDirect === false ? "Transitive" : null) },
  { header: "In Inventory", width: 12, value: (a) => yesNo(a.packageExists !== false) },
  // The package's runtime facts from the last SBOM; blank when not determined.
  { header: "In Use", width: 10, value: (a) => (a.packageInUse == null ? null : yesNo(a.packageInUse)) },
  { header: "Used By", width: 24, value: (a) => (a.packageUsedBy?.length ? a.packageUsedBy.join(", ") : null) },
  { header: "Needs Restart", width: 13, value: (a) => (a.packageNeedsRestart ? "Yes" : null) },
  { header: "Summary", width: 60, value: (a) => a.summary ?? null },
  { header: "Severity", width: 10, value: (a) => TIER_LABELS[getAlertSeverityTier(a.severity, a.cvssScore)] },
  { header: "CVSS Score", width: 10, value: (a) => a.cvssScore, numFmt: "0.0" },
  { header: "CVSS Vector", width: 44, value: (a) => a.cvssVector },
  { header: "EPSS Score", width: 10, value: (a) => a.epssScore, numFmt: "0.0000" },
  { header: "EPSS Percentile", width: 14, value: (a) => a.epssPercentile, numFmt: "0.0%" },
  { header: "KEV", width: 6, value: (a) => yesNo(a.isKev) },
  { header: "Malware", width: 9, value: (a) => yesNo(a.externalId.startsWith("MAL-")) },
  { header: "Approximate Match", width: 12, value: (a) => yesNo(a.approximateMatch) },
  { header: "Sources", width: 18, value: (a) => a.sources.join(", ") },
  { header: "Fix Available", width: 12, value: (a) => yesNo(!!a.fixedVersion) },
  { header: "Fixed In", width: 20, value: (a) => a.fixedVersion ?? null },
  { header: "Fix Status", width: 16, value: (a) => fixStatusLabel(a.fixStatus) },
  { header: "Fix Status Detail", width: 30, value: (a) => a.fixStatusDetail ?? null },
  { header: "Distro Rating", width: 18, value: (a) => distroPriorityLabel(a.ecosystem, a.distroPriority) },
  { header: "Status", width: 12, value: (a) => STATUS_LABELS[a.status] ?? a.status },
  { header: "Ignore Reason", width: 16, value: (a) => (isIgnoreReason(a.ignoreReason) ? IGNORE_REASONS[a.ignoreReason] : null) },
  { header: "VEX Justification", width: 24, value: (a) => a.vexJustification ?? null },
  { header: "Resolve Reason", width: 40, value: (a) => a.resolveReason },
  { header: "Not Applicable by Scan", width: 14, value: (a) => yesNo(a.notApplicableByScan) },
  { header: "Notes", width: 40, value: (a) => a.notes, wrap: true },
  { header: "Detected (UTC)", width: 17, value: (a) => date(a.detectedAt), numFmt: DATE_FORMAT },
  { header: "Due Date (UTC)", width: 17, value: (a) => date(a.dueDate), numFmt: DATE_FORMAT },
  { header: "Resolved (UTC)", width: 17, value: (a) => date(a.resolvedAt), numFmt: DATE_FORMAT },
  { header: "Updated (UTC)", width: 17, value: (a) => date(a.updatedAt), numFmt: DATE_FORMAT },
  { header: "Timeline", width: 80, value: (_a, timeline) => timeline, wrap: true },
]

/**
 * One alert's row. Every text is written as text and cut to what a cell holds;
 * exceljs stores a string as a string, so a value starting with "=" is never a formula.
 */
export function alertXlsxRow(a: Alert, timeline: string): Value[] {
  return ALERT_XLSX_COLUMNS.map((c) => {
    const v = c.value(a, timeline)
    return typeof v === "string" ? cellText(v) : v
  })
}

export type XlsxExportInfo = {
  generatedAt: Date
  /** The list's URL parameters the view was exported with ("" for none). */
  filters: string
}

/**
 * Write the alerts to `out` as an .xlsx workbook: an Alerts sheet, then an
 * Export sheet saying when and with which filters, and how many alerts. Returns
 * the number of alerts written. Stops with an error past Excel's row limit
 * rather than writing a file that silently lost rows.
 */
export async function writeAlertsXlsx(
  out: Writable,
  batches: AsyncIterable<Alert[]>,
  timelines: (alertIds: string[]) => Promise<Map<string, string>>,
  info: XlsxExportInfo,
): Promise<number> {
  // Shared strings would be held in memory until the end; inline strings keep it flat.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false })
  const sheet = workbook.addWorksheet("Alerts", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = ALERT_XLSX_COLUMNS.map((c, i) => ({
    key: String(i),
    width: c.width,
    style: { ...(c.numFmt ? { numFmt: c.numFmt } : {}), ...(c.wrap ? { alignment: { wrapText: true, vertical: "top" as const } } : {}) },
  }))
  const header = sheet.addRow(ALERT_XLSX_COLUMNS.map((c) => c.header))
  header.font = { bold: true }
  header.commit()
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ALERT_XLSX_COLUMNS.length } }

  let count = 0
  for await (const alerts of batches) {
    if (count + alerts.length > XLSX_MAX_ALERTS) {
      throw new Error(`The view has more than ${XLSX_MAX_ALERTS.toLocaleString("en-US")} alerts, more than one Excel sheet holds. Narrow it with the filters.`)
    }
    const text = await timelines(alerts.map((a) => a.id))
    for (const a of alerts) sheet.addRow(alertXlsxRow(a, text.get(a.id) ?? "")).commit()
    count += alerts.length
  }
  sheet.commit()

  const about = workbook.addWorksheet("Export")
  about.columns = [{ width: 18 }, { width: 100 }]
  about.addRow(["Generated (UTC)", info.generatedAt]).getCell(2).numFmt = "yyyy-mm-dd hh:mm:ss"
  about.addRow(["Filters", info.filters || "(none)"])
  about.addRow(["Alerts", count])
  about.commit()

  await workbook.commit()
  return count
}
