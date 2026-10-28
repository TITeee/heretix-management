/**
 * The Alerts list's CSV and JSON export, one alert at a time, so the browser
 * (the old list) and the export endpoint (app/api/alerts/export) write the
 * same columns. Client-safe.
 */
import type { Alert } from "@/lib/alerts/list-filters"

export const ALERT_CSV_HEADERS = [
  "Vuln ID", "Severity", "CVSS Score", "CVSS Vector",
  "EPSS Score", "EPSS Percentile", "KEV", "Approximate Match",
  "Summary", "Package", "Version", "Ecosystem", "Sources",
  "Asset", "Hostname", "Tags", "Status", "Notes",
  "Detected At", "Due Date", "Resolved At", "Updated At",
]

// A cell starting with one of these is read as a formula by Excel and the like,
// even inside quotes. The summary comes from upstream advisories and notes are
// typed by users, so either could hold `=HYPERLINK(...)` or worse.
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One CSV cell: quoted, quotes doubled, and a value that would start a formula
 * prefixed with `'` so a spreadsheet shows it as text (OWASP's CSV injection advice).
 * Numbers are written as they are: a negative one is not text that runs.
 */
export function escapeCSV(v: unknown): string {
  let s = v == null ? "" : String(v)
  if (typeof v !== "number" && FORMULA_START.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function alertCsvHeaderLine(): string {
  return ALERT_CSV_HEADERS.map(escapeCSV).join(",")
}

export function alertCsvLine(a: Alert): string {
  return [
    a.externalId,
    a.severity ?? "",
    a.cvssScore ?? "",
    a.cvssVector ?? "",
    a.epssScore ?? "",
    a.epssPercentile != null ? (a.epssPercentile * 100).toFixed(1) : "",
    a.isKev ? "Yes" : "No",
    a.approximateMatch ? "Yes" : "No",
    a.summary ?? "",
    a.packageName,
    a.packageVersion,
    a.ecosystem,
    a.sources.join(";"),
    a.asset.name || a.asset.hostname,
    a.asset.hostname,
    a.tags.map(t => t.name).join(";"),
    a.status,
    a.notes ?? "",
    new Date(a.detectedAt).toISOString(),
    a.dueDate ? new Date(a.dueDate).toISOString() : "",
    a.resolvedAt ? new Date(a.resolvedAt).toISOString() : "",
    new Date(a.updatedAt).toISOString(),
  ].map(escapeCSV).join(",")
}

export function alertJsonRecord(a: Alert) {
  return {
    vulnId: a.externalId,
    severity: a.severity,
    cvssScore: a.cvssScore,
    cvssVector: a.cvssVector,
    epssScore: a.epssScore,
    epssPercentile: a.epssPercentile,
    kev: a.isKev,
    approximateMatch: a.approximateMatch,
    summary: a.summary,
    package: a.packageName,
    version: a.packageVersion,
    ecosystem: a.ecosystem,
    sources: a.sources,
    asset: a.asset.name || a.asset.hostname,
    hostname: a.asset.hostname,
    tags: a.tags.map(t => t.name),
    status: a.status,
    notes: a.notes,
    detectedAt: new Date(a.detectedAt).toISOString(),
    dueDate: a.dueDate ? new Date(a.dueDate).toISOString() : null,
    resolvedAt: a.resolvedAt ? new Date(a.resolvedAt).toISOString() : null,
    updatedAt: new Date(a.updatedAt).toISOString(),
  }
}

/** One element of `JSON.stringify(records, null, 2)`, as it appears inside the array. */
export function alertJsonElement(a: Alert): string {
  return JSON.stringify(alertJsonRecord(a), null, 2).replace(/^/gm, "  ")
}

export function exportFilename(ext: "csv" | "json", now: Date = new Date()): string {
  return `alerts-${now.toISOString().slice(0, 10)}.${ext}`
}
