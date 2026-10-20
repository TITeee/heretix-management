import { describe, it, expect } from "vitest"
import { alertCsvLine, alertJsonElement, alertJsonRecord, alertCsvHeaderLine, exportFilename } from "./export-format"
import type { Alert } from "./list-filters"

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", assetId: "s1", packageName: "openssl", packageVersion: "1:3.5.8-2.el9_8", ecosystem: "Red Hat:9",
  externalId: "CVE-2026-0001", sources: ["red-hat", "osv"], cvssScore: 7.5, cvssVector: "CVSS:3.1/AV:N", severity: "HIGH",
  summary: 'A "quoted" summary, with a comma', isKev: true, epssScore: 0.12, epssPercentile: 0.9512, approximateMatch: false,
  status: "open", notes: null, resolveReason: null, detectedAt: new Date("2026-10-01T00:00:00Z"), dueDate: null,
  updatedAt: new Date("2026-10-02T00:00:00Z"), resolvedAt: null,
  asset: { id: "s1", name: "", hostname: "host-1" }, tags: [{ id: "t1", name: "prod", color: null }],
  ...over,
})

describe("alert export format", () => {
  it("quotes every CSV field and doubles quotes", () => {
    const line = alertCsvLine(alert())
    expect(line.startsWith('"CVE-2026-0001","HIGH","7.5","CVSS:3.1/AV:N","0.12","95.1","Yes","No","A ""quoted"" summary, with a comma"')).toBe(true)
    expect(line).toContain('"red-hat;osv","host-1","host-1","prod","open",""')
    expect(alertCsvHeaderLine().split(",")).toHaveLength(22)
    expect(line.split('","')).toHaveLength(22)
  })

  it("streams JSON that reads back as JSON.stringify(records, null, 2) would", () => {
    const alerts = [alert(), alert({ id: "a2", externalId: "MAL-2026-1", tags: [] })]
    const streamed = "[\n" + alerts.map(alertJsonElement).join(",\n") + "\n]"
    expect(streamed).toBe(JSON.stringify(alerts.map(alertJsonRecord), null, 2))
  })

  it("names the file by date", () => {
    expect(exportFilename("csv", new Date("2026-10-20T23:00:00Z"))).toBe("alerts-2026-10-20.csv")
  })
})
