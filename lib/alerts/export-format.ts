/**
 * The Alerts list's JSON export, one alert at a time, so the browser (the old
 * list) and the export endpoint (app/api/alerts/export) write the same fields.
 * The Excel export is lib/alerts/export-xlsx.ts. Client-safe.
 */
import type { Alert } from "@/lib/alerts/list-filters"

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

export function exportFilename(ext: "xlsx" | "json", now: Date = new Date()): string {
  return `alerts-${now.toISOString().slice(0, 10)}.${ext}`
}
