import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { buildExecutiveReport } from "./executive"
import { openAt } from "./history"

// October 2026 is the period; September the one before it.
const at = (s: string) => new Date(`${s}T00:00:00Z`)
const period = { from: at("2026-10-01"), to: at("2026-11-01") }
const now = at("2026-11-03")

async function asset(name: string, tags: string[] = []) {
  return prisma.asset.create({
    data: {
      name, hostname: name, osId: "debian", osVersionId: "13", osName: "Debian 13",
      sbomTool: "heretix-cli 0.5.3", scannedAt: at("2026-11-02"),
      assetTags: { create: tags.map((tagId) => ({ tagId })) },
    },
  })
}

let seq = 0
async function alert(assetId: string, data: {
  detectedAt: string; status?: string; severity?: string; isKev?: boolean; fixedVersion?: string | null
  dueDate?: string; packageName?: string; externalId?: string; ignoreReason?: string; resolvedAt?: string
}) {
  seq++
  return prisma.alert.create({
    data: {
      assetId,
      packageName: data.packageName ?? `pkg${seq}`, packageVersion: "1.0", ecosystem: "Debian:13",
      externalId: data.externalId ?? `CVE-2026-${1000 + seq}`, sources: ["osv"],
      severity: data.severity ?? "HIGH", isKev: data.isKev ?? false,
      fixedVersion: data.fixedVersion === undefined ? "1.1" : data.fixedVersion,
      status: data.status ?? "open", ignoreReason: data.ignoreReason ?? null,
      detectedAt: at(data.detectedAt),
      dueDate: data.dueDate ? at(data.dueDate) : null,
      resolvedAt: data.resolvedAt ? at(data.resolvedAt) : null,
    },
  })
}

async function event(alertId: string, day: string, type: string, data: Record<string, string>) {
  await prisma.alertEvent.create({ data: { alertId, type, data, createdAt: at(day) } })
}

describe("executive report", () => {
  beforeEach(async () => {
    await resetDb()
    seq = 0
  })

  it("counts an alert resolved and then reopened as open, and as resolved only in the period it was resolved", async () => {
    const a = await asset("web1")
    const reopened = await alert(a.id, { detectedAt: "2026-08-20" })
    await event(reopened.id, "2026-09-10", "status_changed", { from: "open", to: "resolved" })
    await event(reopened.id, "2026-10-10", "status_changed", { from: "resolved", to: "open" })

    const counts = await openAt([at("2026-09-01"), at("2026-09-20"), at("2026-10-20")])
    expect(counts.map((c) => c.point)).toEqual(expect.arrayContaining([0, 2]))
    expect(counts.find((c) => c.point === 1)).toBeUndefined()

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    const all = report.scopes[0]
    expect(all.period.resolved).toBe(0)
    expect(all.previous.resolved).toBe(1)
    expect(all.open.alerts).toBe(1)
  })

  it("reads a VEX import as a status change, and works out on-time resolution and the mean time to resolve", async () => {
    const a = await asset("db1")
    const onTime = await alert(a.id, { detectedAt: "2026-10-01", severity: "CRITICAL", dueDate: "2026-10-20", status: "resolved" })
    await event(onTime.id, "2026-10-05", "status_changed", { from: "open", to: "resolved" })
    const late = await alert(a.id, { detectedAt: "2026-10-01", severity: "CRITICAL", dueDate: "2026-10-03", status: "resolved" })
    await event(late.id, "2026-10-11", "vex_imported", { from: "open", to: "resolved" })

    const { period: p } = (await buildExecutiveReport({ period, tagIds: [], now })).scopes[0]
    expect(p.resolved).toBe(2)
    expect(p.resolvedWithDue).toBe(2)
    expect(p.resolvedOnTime).toBe(1)
    expect(p.onTimeRate).toBe(0.5)
    expect(p.mttrCriticalDays).toBe(7) // (4 + 10) / 2
  })

  it("puts an asset under each of its tags, and lists the assets with none", async () => {
    const prod = await prisma.tag.create({ data: { name: "Production", type: "asset" } })
    const sales = await prisma.tag.create({ data: { name: "Sales", type: "asset" } })
    const both = await asset("app1", [prod.id, sales.id])
    const none = await asset("lab1")
    await alert(both.id, { detectedAt: "2026-10-02", isKev: true })
    await alert(none.id, { detectedAt: "2026-10-02" })

    const report = await buildExecutiveReport({ period, tagIds: [prod.id, sales.id], now })
    const byLabel = Object.fromEntries(report.scopes.map((s) => [s.label, s]))
    expect(Object.keys(byLabel)).toEqual(["All assets", "Production", "Sales", "No tag"])
    expect(byLabel["All assets"].open.alerts).toBe(2)
    expect(byLabel["Production"].open.kev).toBe(1)
    expect(byLabel["Sales"].open.kev).toBe(1)
    expect(byLabel["No tag"].assets).toBe(1)
    expect(byLabel["All assets"].period.detected).toBe(2)
    // One change per vulnerable package; the KEV one counted as fixing an exploited finding.
    expect(byLabel["All assets"].fixes).toEqual({ changes: 2, alerts: 2, kevChanges: 1, kevAlerts: 1 })
  })

  it("lists what needs a decision, the internet-facing exposure and the accepted risks with who accepted them", async () => {
    const internet = await prisma.tag.create({ data: { name: "Internet Facing", type: "asset", isDefault: true } })
    const edge = await asset("edge1", [internet.id])
    await alert(edge.id, { detectedAt: "2026-09-01", severity: "CRITICAL", fixedVersion: null, packageName: "openssl", dueDate: "2026-09-15" })
    await alert(edge.id, { detectedAt: "2026-10-01", externalId: "MAL-2026-1", packageName: "evil-pkg" })
    const accepted = await alert(edge.id, { detectedAt: "2026-09-01", isKev: true, status: "ignored", ignoreReason: "accepted_risk", packageName: "bash" })
    await event(accepted.id, "2026-10-12", "status_changed", { from: "open", to: "ignored", ignoreReason: "accepted_risk", reason: "Isolated by ACL", userName: "Alice" })

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    expect(report.decisions.noFix.rows).toMatchObject([{ assetName: "edge1", target: "openssl", critical: 1 }])
    expect(report.decisions.longOverdue.rows).toMatchObject([{ assetName: "edge1", alerts: 1 }])
    expect(report.decisions.malicious.rows).toMatchObject([{ assetName: "edge1", externalId: "MAL-2026-1" }])
    // edge1 has never had a vulnerability scan job.
    expect(report.decisions.scanGaps.rows).toMatchObject([{ assetName: "edge1", lastScanAt: null }])
    expect(report.internetFacing).toMatchObject({ tagFound: true, assets: 1, critical: 1 })
    expect(report.acceptedRisks.rows).toMatchObject([{ assetName: "edge1", target: "bash", kev: 1, acceptedBy: "Alice", reason: "Isolated by ACL" }])
    expect(report.scopes[0].period.accepted).toBe(1)
  })
})
