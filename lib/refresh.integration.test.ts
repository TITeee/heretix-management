import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { getVulnerabilityById } from "@/lib/heretix-api"
import { refreshMetadata } from "@/lib/refresh"
import { getRefreshStatus, recordRefreshStatus } from "@/lib/refresh-status"

vi.mock("@/lib/heretix-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/heretix-api")>("@/lib/heretix-api")
  return { ...actual, getVulnerabilityById: vi.fn().mockResolvedValue(null) }
})
vi.mock("@/lib/slack", () => ({ notifySlackIfNeeded: vi.fn().mockResolvedValue(undefined) }))

const mockedLookup = getVulnerabilityById as unknown as ReturnType<typeof vi.fn>

async function openAlerts(ids: string[]) {
  const asset = await prisma.asset.create({ data: { name: "a", hostname: "a", osName: "Debian 13", osId: "debian", osVersionId: "13" } })
  for (const externalId of ids) {
    await prisma.alert.create({
      data: { assetId: asset.id, packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm", externalId, sources: ["osv"], severity: "HIGH", cvssScore: 7.5 },
    })
  }
}

describe("refreshMetadata status", () => {
  beforeEach(async () => {
    await resetDb()
    mockedLookup.mockReset().mockResolvedValue(null)
  })
  afterAll(() => prisma.$disconnect())

  it("records a refresh that changed nothing, which leaves no run behind", async () => {
    await openAlerts(["CVE-2026-1", "CVE-2026-2"])
    const result = await refreshMetadata()
    expect(result).toEqual({ updated: 0, failed: 0, total: 2 })
    expect(await prisma.metadataRefreshRun.count()).toBe(0)

    const status = await getRefreshStatus()
    expect(status).toMatchObject({ total: 2, failed: 0, error: null })
    expect(status!.lastSuccessAt).toBe(status!.at)
  })

  it("keeps the last success when a later refresh fails", async () => {
    await openAlerts(["CVE-2026-1", "CVE-2026-2"])
    await refreshMetadata()
    const good = (await getRefreshStatus())!

    mockedLookup.mockRejectedValue(new Error("heretix-api lookup error: 503"))
    const result = await refreshMetadata()
    expect(result).toMatchObject({ failed: 2, total: 2 })

    const status = (await getRefreshStatus())!
    expect(status).toMatchObject({ total: 2, failed: 2, error: null })
    expect(status.lastSuccessAt).toBe(good.lastSuccessAt)
  })

  it("records an error without a success of its own", async () => {
    await recordRefreshStatus({ total: 0, failed: 0, error: "connection refused" })
    expect(await getRefreshStatus()).toMatchObject({ error: "connection refused", lastSuccessAt: null })
  })
})
