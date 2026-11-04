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

    const counts = await openAt([at("2026-09-01"), at("2026-09-20"), at("2026-10-20")], 90)
    expect(counts.map((c) => c.point)).toEqual(expect.arrayContaining([0, 2]))
    expect(counts.find((c) => c.point === 1)).toBeUndefined()

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    const all = report.scopes[0]
    expect(all.period.resolved).toBe(0)
    expect(all.previous.resolved).toBe(1)
    expect(all.open.alerts).toBe(1)
  })

  it("counts the open findings past their due date and open over 90 days at the start and the end of the period", async () => {
    const a = await asset("web1")
    // Open all along, due before the period: past due at both ends, and over 90 days old by the end.
    await alert(a.id, { detectedAt: "2026-07-15", dueDate: "2026-08-01" })
    // Due within the period: past due only at its end.
    await alert(a.id, { detectedAt: "2026-09-20", dueDate: "2026-10-10" })
    // Past due at the start, resolved within the period.
    const fixed = await alert(a.id, { detectedAt: "2026-09-01", dueDate: "2026-09-10", status: "resolved" })
    await event(fixed.id, "2026-10-05", "status_changed", { from: "open", to: "resolved" })

    const all = (await buildExecutiveReport({ period, tagIds: [], now })).scopes[0]
    expect([all.trendOverdue[0], all.trendOverdue.at(-1)]).toEqual([2, 2])
    expect([all.trendAged[0], all.trendAged.at(-1)]).toEqual([0, 1])
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
    expect(p.medianCriticalDays).toBe(7)
    expect(p.medianHighDays).toBeNull()
  })

  it("covers every asset with no tag chosen: a row per asset tag, an asset under each of its tags, and the assets with none", async () => {
    const prod = await prisma.tag.create({ data: { name: "Production", type: "asset" } })
    const sales = await prisma.tag.create({ data: { name: "Sales", type: "asset" } })
    const both = await asset("app1", [prod.id, sales.id])
    const none = await asset("lab1")
    await alert(both.id, { detectedAt: "2026-10-02", isKev: true })
    await alert(none.id, { detectedAt: "2026-10-02" })

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    expect(report.tags).toEqual([])
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

  it("covers only the assets carrying a chosen tag, in every number and list", async () => {
    const prod = await prisma.tag.create({ data: { name: "Production", type: "asset" } })
    const sales = await prisma.tag.create({ data: { name: "Sales", type: "asset" } })
    const app = await asset("app1", [prod.id])
    const crm = await asset("crm1", [sales.id])
    const lab = await asset("lab1")
    await alert(app.id, { detectedAt: "2026-10-02", isKev: true })
    await alert(crm.id, { detectedAt: "2026-10-02", severity: "CRITICAL", fixedVersion: null })
    await alert(lab.id, { detectedAt: "2026-10-02", externalId: "MAL-2026-2" })

    const report = await buildExecutiveReport({ period, tagIds: [prod.id], now })
    expect(report.tags).toEqual([{ id: prod.id, name: "Production" }])
    expect(report.scopes.map((s) => [s.label, s.assets, s.open.alerts])).toEqual([["Selected assets", 1, 1], ["Production", 1, 1]])
    expect(report.scopes[0].period.detected).toBe(1)
    expect(report.scopes[0].trend.at(-1)).toBe(1)
    expect(report.decisions.noFix.total).toBe(0)
    expect(report.decisions.malicious.total).toBe(0)
    expect(report.decisions.scanGaps.rows.map((r) => r.assetName)).toEqual(["app1"])
    expect(report.topAssets.map((r) => r.assetName)).toEqual(["app1"])
  })

  it("lists the mission critical assets, the internet-facing ones first, and marks them in every list", async () => {
    const internet = await prisma.tag.create({ data: { name: "Internet Facing", type: "asset", isDefault: true } })
    const mission = await prisma.tag.create({ data: { name: "Mission Critical", type: "asset", isDefault: true } })
    const core = await asset("core1", [mission.id])
    const portal = await asset("portal1", [mission.id, internet.id])
    const lab = await asset("lab1")
    await alert(core.id, { detectedAt: "2026-10-02", isKev: true })
    await alert(core.id, { detectedAt: "2026-10-02", isKev: true })
    await alert(portal.id, { detectedAt: "2026-10-02", severity: "CRITICAL" })
    await alert(lab.id, { detectedAt: "2026-10-02", isKev: true })

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    expect(report.missionCritical).toMatchObject({ tagFound: true, assets: 2, kev: 2, critical: 1 })
    expect(report.missionCritical.rows.map((r) => r.assetName)).toEqual(["portal1", "core1"])
    expect(report.topAssets.map((r) => [r.assetName, r.missionCritical, r.internetFacing])).toEqual([
      ["core1", true, false], ["lab1", false, false], ["portal1", true, true],
    ])
  })

  it("lists a package with no fix once, with how many assets carry it and the most important of them first", async () => {
    const internet = await prisma.tag.create({ data: { name: "Internet Facing", type: "asset", isDefault: true } })
    const mission = await prisma.tag.create({ data: { name: "Mission Critical", type: "asset", isDefault: true } })
    for (const [name, tags] of [["a1", []], ["a2", []], ["web1", [internet.id]], ["core1", [mission.id]]] as const) {
      const a = await asset(name, [...tags])
      await alert(a.id, { detectedAt: "2026-10-02", severity: "CRITICAL", fixedVersion: null, packageName: "openssl" })
    }
    const other = await asset("b1")
    await alert(other.id, { detectedAt: "2026-10-02", isKev: true, fixedVersion: null, packageName: "bash" })

    const { noFix } = (await buildExecutiveReport({ period, tagIds: [], now })).decisions
    expect(noFix.total).toBe(2)
    expect(noFix.rows.map((r) => [r.target, r.assetCount, r.alerts, r.assets.map((a) => a.assetName)])).toEqual([
      ["bash", 1, 1, ["b1"]],
      ["openssl", 4, 4, ["core1", "web1", "a1"]],
    ])
  })

  it("lists what needs a decision, the internet-facing exposure and the accepted risks with who accepted them", async () => {
    const internet = await prisma.tag.create({ data: { name: "Internet Facing", type: "asset", isDefault: true } })
    const edge = await asset("edge1", [internet.id])
    await alert(edge.id, { detectedAt: "2026-09-01", severity: "CRITICAL", fixedVersion: null, packageName: "openssl", dueDate: "2026-09-15" })
    await alert(edge.id, { detectedAt: "2026-10-01", externalId: "MAL-2026-1", packageName: "evil-pkg" })
    const accepted = await alert(edge.id, { detectedAt: "2026-09-01", isKev: true, status: "ignored", ignoreReason: "accepted_risk", packageName: "bash" })
    await event(accepted.id, "2026-10-12", "status_changed", { from: "open", to: "ignored", ignoreReason: "accepted_risk", reason: "Isolated by ACL", userName: "Alice" })

    const report = await buildExecutiveReport({ period, tagIds: [], now })
    expect(report.decisions.noFix.rows).toMatchObject([{ target: "openssl", assetCount: 1, assets: [{ assetName: "edge1" }], critical: 1 }])
    expect(report.decisions.longOverdue.rows).toMatchObject([{ assetName: "edge1", alerts: 1 }])
    expect(report.decisions.malicious.rows).toMatchObject([{ assetName: "edge1", externalId: "MAL-2026-1" }])
    // edge1 has never had a vulnerability scan job.
    expect(report.decisions.scanGaps.rows).toMatchObject([{ assetName: "edge1", lastScanAt: null }])
    expect(report.internetFacing).toMatchObject({ tagFound: true, assets: 1, critical: 1 })
    expect(report.missionCritical).toMatchObject({ tagFound: false, assets: 0 })
    expect(report.acceptedRisks.rows).toMatchObject([{ assetName: "edge1", target: "bash", kev: 1, acceptedBy: "Alice", reason: "Isolated by ACL" }])
    expect(report.scopes[0].period.accepted).toBe(1)
  })
})
