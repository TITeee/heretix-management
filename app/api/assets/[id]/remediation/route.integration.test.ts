import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { GET } from "./route"
import { POST } from "./accept/route"

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
    expect(body.plan.actions[0]).toMatchObject({ kind: "os_update", target: "openssh", alertIds: [fixable.id] })
    expect(body.plan.noFix).toHaveLength(1)
    expect(body.plan.noFix[0]).toMatchObject({ fixStatus: "deferred", alertIds: [noFix.id] })
    expect(body.alerts).toHaveLength(2)
  })

  it("points out alerts accepted as risk that now have a fix, without counting other ignore reasons", async () => {
    const { asset } = await setup()
    const base = { assetId: asset.id, ecosystem: "Red Hat:9", sources: ["osv"], status: "ignored", fixedVersion: "2.9.13-6.el9", sourcePackage: "libxml2" }
    const accepted = await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2001", ignoreReason: "accepted_risk" } })
    await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2002", ignoreReason: "not_affected", vexJustification: "code_not_present" } })
    await prisma.alert.create({ data: { ...base, packageName: "libxml2", packageVersion: "2.9.13-1", externalId: "CVE-2026-2003", ignoreReason: "accepted_risk", fixedVersion: null } })

    const body = await (await GET(new NextRequest("http://localhost"), params(asset.id))).json()
    expect(body.acceptedWithFix).toHaveLength(1)
    expect(body.acceptedWithFix[0]).toMatchObject({ kind: "os_update", target: "libxml2", alertIds: [accepted.id] })
    expect(body.alerts.map((a: { id: string }) => a.id)).toContain(accepted.id)
    // The open plan is unaffected: the accepted alert stays out of the changes to make.
    expect(body.plan.actions.flatMap((a: { alertIds: string[] }) => a.alertIds)).not.toContain(accepted.id)
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

  it("rejects a request without alert ids", async () => {
    const { asset } = await setup()
    const res = await POST(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ alertIds: [] }) }), params(asset.id))
    expect(res.status).toBe(400)
  })
})
