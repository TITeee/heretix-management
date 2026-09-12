import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { batchSearch, searchByCPE } from "@/lib/heretix-api"
import { scanAsset } from "@/lib/scan"

vi.mock("@/lib/heretix-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/heretix-api")>("@/lib/heretix-api")
  return {
    ...actual,
    batchSearch: vi.fn().mockResolvedValue([]),
    searchByCPE: vi.fn().mockResolvedValue({ results: [] }),
  }
})

const mockedBatchSearch = batchSearch as unknown as ReturnType<typeof vi.fn>
const mockedSearchByCPE = searchByCPE as unknown as ReturnType<typeof vi.fn>

vi.mock("@/lib/slack", () => ({
  notifySlackIfNeeded: vi.fn().mockResolvedValue(undefined),
}))

async function createAsset() {
  return prisma.asset.create({
    data: { name: "host-1", hostname: "host-1", osId: "debian", osVersionId: "13", osName: "Debian 13" },
  })
}

describe("scanAsset — scope=excluded packages", () => {
  beforeEach(async () => {
    await resetDb()
    mockedBatchSearch.mockReset().mockResolvedValue([])
    mockedSearchByCPE.mockReset().mockResolvedValue({ results: [] })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("never sends a scope=excluded package to heretix-api", async () => {
    const asset = await createAsset()
    await prisma.package.create({
      data: { assetId: asset.id, name: "lodash", version: "4.17.20", rawVersion: "4.17.20", ecosystem: "npm", source: "sbom", deps: [] },
    })
    await prisma.package.create({
      data: { assetId: asset.id, name: "linux-libc-dev", version: "6.12.107-1", rawVersion: "6.12.107-1", ecosystem: "Debian:13", source: "sbom", scope: "excluded", deps: [] },
    })

    await scanAsset(asset.id)

    expect(mockedBatchSearch).toHaveBeenCalledTimes(1)
    const queriedNames = mockedBatchSearch.mock.calls[0][0].map((p: { package: string }) => p.package)
    expect(queriedNames).toEqual(["lodash"])
  })

  it("never sends a scope=excluded CPE-matched package to heretix-api", async () => {
    const asset = await createAsset()
    await prisma.package.create({
      data: {
        assetId: asset.id, name: "binutils", version: "2.44-3", rawVersion: "2.44-3", ecosystem: "Debian:13",
        source: "sbom", scope: "excluded", cpe: "cpe:2.3:a:gnu:binutils:2.44:*:*:*:*:*:*:*", deps: [],
      },
    })

    await scanAsset(asset.id)

    expect(mockedSearchByCPE).not.toHaveBeenCalled()
  })

  it("auto-resolves a pre-existing alert on a package that is now classified excluded, without querying heretix-api for it", async () => {
    const asset = await createAsset()
    await prisma.package.create({
      data: { assetId: asset.id, name: "linux-libc-dev", version: "6.12.107-1", rawVersion: "6.12.107-1", ecosystem: "Debian:13", source: "sbom", scope: "excluded", deps: [] },
    })
    const alert = await prisma.alert.create({
      data: {
        assetId: asset.id, packageName: "linux-libc-dev", packageVersion: "6.12.107-1", ecosystem: "Debian:13",
        externalId: "CVE-2026-0001", sources: ["osv"], status: "open",
      },
    })

    const result = await scanAsset(asset.id)

    expect(result.resolvedAlerts).toBe(1)
    expect(mockedBatchSearch).not.toHaveBeenCalled()
    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("resolved")
    expect(updated.resolveReason).toBe("Auto-resolved: no longer detected by scan")
  })
})
