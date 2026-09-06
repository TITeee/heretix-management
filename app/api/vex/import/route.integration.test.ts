import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { POST } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function importRequest(assetId: string, body: unknown) {
  return new NextRequest(`http://localhost/api/vex/import?assetId=${assetId}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

async function createAssetWithAlert(overrides: Partial<Parameters<typeof prisma.alert.create>[0]["data"]> = {}) {
  const asset = await prisma.asset.create({
    data: { name: "host-1", hostname: "host-1", osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
  })
  const alert = await prisma.alert.create({
    data: {
      assetId: asset.id,
      packageName: "lodash",
      packageVersion: "4.17.20",
      ecosystem: "npm",
      externalId: "CVE-2026-1111",
      sources: ["osv"],
      status: "open",
      ...overrides,
    },
  })
  return { asset, alert }
}

describe("POST /api/vex/import", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await POST(importRequest("asset-1", { bomFormat: "CycloneDX", vulnerabilities: [] }))
    expect(res.status).toBe(401)
  })

  it("requires an assetId query param", async () => {
    const req = new NextRequest("http://localhost/api/vex/import", {
      method: "POST",
      body: JSON.stringify({ bomFormat: "CycloneDX", vulnerabilities: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("rejects a non-CycloneDX document", async () => {
    const res = await POST(importRequest("asset-1", { bomFormat: "SPDX", vulnerabilities: [] }))
    expect(res.status).toBe(400)
  })

  it("marks an alert ignored with not_affected when a justification is present", async () => {
    const { asset, alert } = await createAssetWithAlert()

    const res = await POST(importRequest(asset.id, {
      bomFormat: "CycloneDX",
      serialNumber: "urn:uuid:test",
      vulnerabilities: [{
        id: "CVE-2026-1111",
        affects: [{ ref: "pkg:npm/lodash@4.17.20" }],
        analysis: { state: "not_affected", justification: "code_not_present" },
      }],
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ applied: 1, skipped: 0, notFound: 0, unsupportedRange: 0 })

    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("ignored")
    expect(updated.ignoreReason).toBe("not_affected")
    expect(updated.vexJustification).toBe("code_not_present")

    const events = await prisma.alertEvent.findMany({ where: { alertId: alert.id } })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("vex_imported")
  })

  it("skips not_affected without a justification, since that state cannot be represented", async () => {
    const { asset, alert } = await createAssetWithAlert()

    const res = await POST(importRequest(asset.id, {
      bomFormat: "CycloneDX",
      vulnerabilities: [{
        id: "CVE-2026-1111",
        affects: [{ ref: "pkg:npm/lodash@4.17.20" }],
        analysis: { state: "not_affected" },
      }],
    }))

    expect(await res.json()).toEqual({ applied: 0, skipped: 1, notFound: 0, unsupportedRange: 0 })
    const unchanged = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(unchanged.status).toBe("open")
  })

  it("resolves an alert on a fixed state and sets resolvedAt", async () => {
    const { asset, alert } = await createAssetWithAlert()

    await POST(importRequest(asset.id, {
      bomFormat: "CycloneDX",
      vulnerabilities: [{
        id: "CVE-2026-1111",
        affects: [{ ref: "pkg:npm/lodash@4.17.20" }],
        analysis: { state: "fixed" },
      }],
    }))

    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("resolved")
    expect(updated.resolvedAt).not.toBeNull()
  })

  it("reports unsupportedRange for a VERS-range affected version instead of guessing", async () => {
    const { asset } = await createAssetWithAlert()

    const res = await POST(importRequest(asset.id, {
      bomFormat: "CycloneDX",
      vulnerabilities: [{
        id: "CVE-2026-1111",
        affects: [{ ref: "pkg:npm/lodash", versions: [{ range: "vers:npm/<4.17.21" }] }],
        analysis: { state: "not_affected", justification: "code_not_present" },
      }],
    }))

    expect(await res.json()).toEqual({ applied: 0, skipped: 0, notFound: 0, unsupportedRange: 1 })
  })

  it("reports notFound when no alert matches the package/version/CVE", async () => {
    const { asset } = await createAssetWithAlert()

    const res = await POST(importRequest(asset.id, {
      bomFormat: "CycloneDX",
      vulnerabilities: [{
        id: "CVE-2026-9999",
        affects: [{ ref: "pkg:npm/lodash@4.17.20" }],
        analysis: { state: "fixed" },
      }],
    }))

    expect(await res.json()).toEqual({ applied: 0, skipped: 0, notFound: 1, unsupportedRange: 0 })
  })
})
