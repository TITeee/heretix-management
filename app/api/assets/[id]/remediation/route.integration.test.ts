import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { GET } from "./route"
import { POST } from "./accept/route"
import { GET as GET_ALERTS } from "./alerts/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function setup() {
  const asset = await prisma.asset.create({
    data: { name: "img", hostname: "img", assetType: "docker_image", osId: "rhel", osVersionId: "9", osName: "RHEL 9" },
  })
  const base = { assetId: asset.id, ecosystem: "Red Hat:9", sources: ["osv"], severity: "MEDIUM", cvssScore: 5.0 }
  const fixable = await prisma.alert.create({ data: { ...base, packageName: "openssh", packageVersion: "8.7p1-1", externalId: "CVE-2026-1001", sourcePackage: "openssh", fixedVersion: "8.7p1-45.el9" } })
  const noFix = await prisma.alert.create({ data: { ...base, packageName: "gawk", packageVersion: "5.1.0-6", externalId: "CVE-2026-1002", fixStatus: "deferred" } })
  const resolved = await prisma.alert.create({ data: { ...base, packageName: "curl", packageVersion: "7.76.1-1", externalId: "CVE-2026-1003", status: "resolved" } })
  return { asset, fixable, noFix, resolved }
}

function alertsRequest(assetId: string, section: string, key: string, extra = "") {
  const q = new URLSearchParams({ section, key })
  return new NextRequest(`http://localhost/api/assets/${assetId}/remediation/alerts?${q}${extra}`)
}

describe("/api/assets/[id]/remediation", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("groups the asset's open alerts into actions and no-fix groups", async () => {
    const { asset, fixable, noFix } = await setup()
    const body = await (await GET(new NextRequest("http://localhost"), params(asset.id))).json()
    expect(body.plan.actions).toHaveLength(1)
    // Counts only: the alerts inside a group come a page at a time from ./alerts.
    expect(body.plan.actions[0]).toMatchObject({ kind: "os_update", target: "openssh", count: 1 })
    expect(body.plan.noFix).toHaveLength(1)
    expect(body.plan.noFix[0]).toMatchObject({ fixStatus: "deferred", count: 1 })
    expect(body).not.toHaveProperty("alerts")
    expect(JSON.stringify(body)).not.toContain(fixable.id)
    expect(JSON.stringify(body)).not.toContain(noFix.id)
  })

  it("points out alerts accepted as risk that now have a fix, without counting other ignore reasons", async () => {
    const { asset } = await setup()
    const base = { assetId: asset.id, ecosystem: "Red Hat:9", sources: ["osv"], status: "ignored", fixedVersion: "2.9.13-6.el9", sourcePackage: "libxml2" }
    const accepted = await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2001", ignoreReason: "accepted_risk" } })
    await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2002", ignoreReason: "not_affected", vexJustification: "code_not_present" } })
    await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2003", ignoreReason: "accepted_risk", fixedVersion: null } })

    const body = await (await GET(new NextRequest("http://localhost"), params(asset.id))).json()
    expect(body.acceptedWithFix).toHaveLength(1)
    expect(body.acceptedWithFix[0]).toMatchObject({ kind: "os_update", target: "libxml2", count: 1 })
    // The open plan is unaffected: the accepted alert stays out of the changes to make.
    expect(body.plan.actions.map((a: { target: string }) => a.target)).not.toContain("libxml2")

    const page = await (await GET_ALERTS(alertsRequest(asset.id, "accepted", body.acceptedWithFix[0].key), params(asset.id))).json()
    expect(page.alerts.map((a: { id: string }) => a.id)).toEqual([accepted.id])
  })

  it("accepts only open no-fix alerts of this asset, marking them to reopen once fixed", async () => {
    const { asset, fixable, noFix, resolved } = await setup()
    const res = await POST(
      new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ alertIds: [noFix.id, fixable.id, resolved.id], memo: "Distro defers it" }) }),
      params(asset.id),
    )
    expect(await res.json()).toEqual({ accepted: 1, skipped: 2 })

    expect(await prisma.alert.findUniqueOrThrow({ where: { id: noFix.id } })).toMatchObject({
      status: "ignored", ignoreReason: "accepted_risk", reopenOnFix: true,
    })
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: fixable.id } })).status).toBe("open")
    const event = await prisma.alertEvent.findFirstOrThrow({ where: { alertId: noFix.id, type: "status_changed" } })
    expect(event.data).toMatchObject({ from: "open", to: "ignored", ignoreReason: "accepted_risk", reason: "Distro defers it" })
  })

  it("accepts a whole no-fix group by its key, without the client sending any ids", async () => {
    const { asset, fixable, noFix } = await setup()
    const other = await prisma.alert.create({
      data: { assetId: asset.id, ecosystem: "Red Hat:9", sources: ["osv"], packageName: "sed", packageVersion: "4.8", externalId: "CVE-2026-1009", fixStatus: "affected" },
    })
    const res = await POST(
      new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ groupKey: "deferred", memo: "Distro defers it" }) }),
      params(asset.id),
    )
    expect(await res.json()).toEqual({ accepted: 1, skipped: 0 })
    expect(await prisma.alert.findUniqueOrThrow({ where: { id: noFix.id } })).toMatchObject({ status: "ignored", ignoreReason: "accepted_risk", reopenOnFix: true })
    // Another no-fix group and a fixable alert are left alone.
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("open")
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: fixable.id } })).status).toBe("open")
  })

  it("rejects a request without alert ids", async () => {
    const { asset } = await setup()
    const res = await POST(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ alertIds: [] }) }), params(asset.id))
    expect(res.status).toBe(400)
  })

  describe("alerts of one group", () => {
    async function bulk(assetId: string, rows: { externalId: string; severity: string | null; cvssScore: number | null; isKev?: boolean }[]) {
      await prisma.alert.createMany({
        data: rows.map((r) => ({
          assetId, ecosystem: "Red Hat:9", sources: ["osv"], packageName: "kernel", packageVersion: "5.14.0-1",
          sourcePackage: "kernel", fixedVersion: "5.14.0-2", ...r,
        })),
      })
    }

    it("returns a slice of the group, most urgent first, with the group's total", async () => {
      const asset = await prisma.asset.create({ data: { name: "k", hostname: "k", assetType: "host", osId: "rhel", osVersionId: "9", osName: "RHEL 9" } })
      await bulk(asset.id, [
        { externalId: "CVE-2026-0003", severity: "LOW", cvssScore: 3.1 },
        { externalId: "CVE-2026-0001", severity: "CRITICAL", cvssScore: 9.8 },
        { externalId: "CVE-2026-0004", severity: "MEDIUM", cvssScore: 5.5, isKev: true },
        { externalId: "CVE-2026-0002", severity: "HIGH", cvssScore: 7.5 },
      ])
      const plan = await (await GET(new NextRequest("http://localhost"), params(asset.id))).json()
      const key = plan.plan.actions[0].key

      const first = await (await GET_ALERTS(alertsRequest(asset.id, "actions", key, "&limit=3"), params(asset.id))).json()
      expect(first.total).toBe(4)
      expect(first.alerts.map((a: { externalId: string }) => a.externalId)).toEqual(["CVE-2026-0004", "CVE-2026-0001", "CVE-2026-0002"])
      expect(first.alerts[0].asset).toMatchObject({ id: asset.id })

      const rest = await (await GET_ALERTS(alertsRequest(asset.id, "actions", key, "&offset=3&limit=3"), params(asset.id))).json()
      expect(rest.alerts.map((a: { externalId: string }) => a.externalId)).toEqual(["CVE-2026-0003"])
    })

    it("answers 404 for a group that is gone and 400 for a missing or unknown section", async () => {
      const { asset } = await setup()
      expect((await GET_ALERTS(alertsRequest(asset.id, "actions", "no-such-key"), params(asset.id))).status).toBe(404)
      expect((await GET_ALERTS(alertsRequest(asset.id, "nope", "x"), params(asset.id))).status).toBe(400)
      expect((await GET_ALERTS(new NextRequest("http://localhost/x"), params(asset.id))).status).toBe(400)
    })

    it("does not return another asset's alerts", async () => {
      const { asset } = await setup()
      const otherAsset = await prisma.asset.create({ data: { name: "o", hostname: "o", assetType: "host", osId: "rhel", osVersionId: "9", osName: "RHEL 9" } })
      const plan = await (await GET(new NextRequest("http://localhost"), params(asset.id))).json()
      const res = await GET_ALERTS(alertsRequest(otherAsset.id, "actions", plan.plan.actions[0].key), params(otherAsset.id))
      expect(res.status).toBe(404)
    })
  })
})
