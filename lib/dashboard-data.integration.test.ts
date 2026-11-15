import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { activeAlertsByAsset, activeSeverityByAsset, activeSeverityCounts, activeSlaCounts, mttrByTier, weeklyCounts } from "@/lib/dashboard-data"

const DAY = 24 * 60 * 60 * 1000
const now = new Date("2026-11-11T12:00:00Z") // a Wednesday

let n = 0
async function alert(assetId: string, data: Record<string, unknown>) {
  return prisma.alert.create({
    data: { assetId, packageName: "p", packageVersion: "1", ecosystem: "npm", externalId: `CVE-2026-${++n}`, sources: ["osv"], ...data },
  })
}

describe("dashboard counts from the database", () => {
  let a1 = "", a2 = ""
  beforeEach(async () => {
    await resetDb()
    const tag = await prisma.tag.create({ data: { name: "Internet Facing", type: "asset" } })
    a1 = (await prisma.asset.create({ data: { name: "web", hostname: "web", osId: "x", osVersionId: "x", osName: "x", assetTags: { create: { tagId: tag.id } } } })).id
    a2 = (await prisma.asset.create({ data: { name: "", hostname: "db-host", osId: "x", osVersionId: "x", osName: "x" } })).id
  })
  afterAll(() => prisma.$disconnect())

  it("counts open alerts per tier, using the word first and the score when there is none", async () => {
    await alert(a1, { severity: "CRITICAL", cvssScore: 3.0, status: "open" })   // the word wins
    await alert(a1, { severity: "MODERATE", status: "in_progress" })            // GHSA's word for medium
    await alert(a1, { severity: null, cvssScore: 7.5, status: "open" })         // high by score
    await alert(a2, { severity: null, cvssScore: null, status: "open" })        // n/a
    await alert(a2, { severity: "LOW", status: "resolved" })                    // not open: not counted
    expect(await activeSeverityCounts()).toEqual({ critical: 1, high: 1, medium: 1, low: 0, na: 1 })
    expect(await activeSeverityCounts({ asset: { assetTags: { some: { tag: { name: "Internet Facing" } } } } }))
      .toEqual({ critical: 1, high: 1, medium: 1, low: 0, na: 0 })
  })

  it("ranks assets by their open alerts, named by hostname when they have no name", async () => {
    await alert(a1, { severity: "HIGH", status: "open" })
    for (let i = 0; i < 3; i++) await alert(a2, { severity: "LOW", status: "open" })
    const { topAssets, overall } = await activeAlertsByAsset()
    expect(topAssets).toEqual([
      { name: "db-host", critical: 0, high: 0, medium: 0, low: 3, na: 0 },
      { name: "web", critical: 0, high: 1, medium: 0, low: 0, na: 0 },
    ])
    expect(overall).toEqual({ critical: 0, high: 1, medium: 0, low: 3, na: 0 })
  })

  it("counts open alerts per asset and tier for the Assets list", async () => {
    await alert(a1, { severity: "HIGH", status: "open" })
    await alert(a1, { severity: null, cvssScore: 9.5, status: "in_progress" })
    await alert(a1, { severity: "HIGH", status: "ignored" })
    await alert(a2, { severity: "LOW", status: "open" })
    const byAsset = await activeSeverityByAsset()
    expect(byAsset.get(a1)).toEqual({ critical: 1, high: 1, medium: 0, low: 0, na: 0 })
    expect(byAsset.get(a2)).toEqual({ critical: 0, high: 0, medium: 0, low: 1, na: 0 })
    expect(byAsset.size).toBe(2)
  })

  it("puts open alerts in the SLA status getSlaStatus gives", async () => {
    await alert(a1, { severity: "HIGH", status: "open", dueDate: new Date(now.getTime() - 1) })           // overdue
    await alert(a1, { severity: "HIGH", status: "open", dueDate: new Date(now.getTime() + 2 * 3600e3) }) // urgent
    await alert(a1, { severity: "LOW", status: "open", dueDate: new Date(now.getTime() + DAY) })          // warning (exactly 24 h)
    await alert(a1, { severity: "LOW", status: "open", dueDate: new Date(now.getTime() + 7 * DAY) })      // ok (exactly 7 days)
    await alert(a1, { severity: "LOW", status: "open", dueDate: null })                                    // unscored
    await alert(a1, { severity: "LOW", status: "resolved", dueDate: new Date(now.getTime() - DAY) })      // not open
    const rows = Object.fromEntries((await activeSlaCounts(now)).map(({ status, ...c }) => [status, c]))
    expect(rows.Overdue).toMatchObject({ high: 1 })
    expect(rows.Urgent).toMatchObject({ high: 1 })
    expect(rows.Warning).toMatchObject({ low: 1 })
    expect(rows.OK).toMatchObject({ low: 1 })
    expect(rows.Unscored).toMatchObject({ low: 1 })
    expect(Object.values(rows).reduce((n, c) => n + c.critical + c.high + c.medium + c.low + c.na, 0)).toBe(5)
  })

  it("counts detections and resolutions per week, every status included", async () => {
    const monday = new Date(2026, 10, 2) // a local Monday
    const starts = [new Date(2026, 9, 26), monday]
    await alert(a1, { status: "open", detectedAt: new Date(2026, 9, 26, 0, 0, 0) })      // first moment of week 1
    await alert(a1, { status: "resolved", detectedAt: new Date(2026, 10, 1, 23, 59), resolvedAt: new Date(2026, 10, 3) })
    await alert(a1, { status: "ignored", detectedAt: new Date(2026, 10, 8, 23, 59) })    // last day of week 2
    await alert(a1, { status: "open", detectedAt: new Date(2026, 10, 9) })               // after the last week
    expect(await weeklyCounts("detectedAt", starts)).toEqual([2, 1])
    expect(await weeklyCounts("resolvedAt", starts)).toEqual([0, 1])
  })

  it("averages the days from detection to resolution per tier, for resolved alerts only", async () => {
    const t = new Date("2026-10-01T00:00:00Z")
    await alert(a1, { severity: "HIGH", status: "resolved", detectedAt: t, resolvedAt: new Date(t.getTime() + 2 * DAY) })
    await alert(a1, { severity: "HIGH", status: "resolved", detectedAt: t, resolvedAt: new Date(t.getTime() + 5 * DAY) })
    await alert(a1, { severity: null, cvssScore: null, status: "resolved", detectedAt: t, resolvedAt: new Date(t.getTime() + DAY / 2) })
    await alert(a1, { severity: "HIGH", status: "open", detectedAt: t })
    await alert(a1, { severity: "HIGH", status: "ignored", detectedAt: t, resolvedAt: new Date(t.getTime() + DAY) })
    const rows = Object.fromEntries((await mttrByTier()).map((r) => [r.tier, r]))
    expect(rows.High).toMatchObject({ count: 2 })
    expect(rows.High.avgDays).toBeCloseTo(3.5, 6)
    expect(rows["N/A"]).toMatchObject({ count: 1 })
    expect(rows["N/A"].avgDays).toBeCloseTo(0.5, 6)
    expect(rows.Critical).toEqual({ tier: "Critical", avgDays: 0, count: 0 })
  })
})
