import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { getScanStatuses } from "@/lib/scan-status"
import { batchSearch } from "@/lib/heretix-api"
import { scanAllAssets } from "@/lib/scan"

vi.mock("@/lib/heretix-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/heretix-api")>("@/lib/heretix-api")
  return { ...actual, batchSearch: vi.fn().mockResolvedValue([]), searchByCPE: vi.fn().mockResolvedValue({ results: [] }) }
})
vi.mock("@/lib/slack", () => ({ notifySlackIfNeeded: vi.fn().mockResolvedValue(undefined) }))

const mockedBatchSearch = batchSearch as unknown as ReturnType<typeof vi.fn>

const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h))

async function job(assetId: string, status: string, hour: number, errorMsg?: string) {
  await prisma.scanJob.create({
    data: { assetId, status, errorMsg, createdAt: at(hour), completedAt: status === "running" ? null : at(hour) },
  })
}

describe("getScanStatuses", () => {
  beforeEach(resetDb)
  afterAll(() => prisma.$disconnect())

  it("has nothing recorded for an asset that was never scanned", async () => {
    const a = await prisma.asset.create({ data: { name: "a", hostname: "a", osName: "Debian 13", osId: "debian", osVersionId: "13" } })
    const s = (await getScanStatuses(a.id)).get(a.id)!
    expect(s).toEqual({ lastSuccessAt: null, lastAttempt: null, failedSince: 0 })
  })

  it("reports the last success and a later failure", async () => {
    const a = await prisma.asset.create({ data: { name: "a", hostname: "a", osName: "Debian 13", osId: "debian", osVersionId: "13" } })
    await job(a.id, "failed", 1, "old failure")
    await job(a.id, "completed", 2)
    await job(a.id, "failed", 3, "boom")
    await job(a.id, "failed", 4, "boom again")
    await job(a.id, "running", 5)
    const s = (await getScanStatuses(a.id)).get(a.id)!
    expect(s.lastSuccessAt).toEqual(at(2))
    expect(s.lastAttempt).toEqual({ at: at(4), failed: true, error: "boom again" })
    expect(s.failedSince).toBe(2)
  })

  it("is not failed once a scan succeeds after a failure, and covers every asset when none is named", async () => {
    const a = await prisma.asset.create({ data: { name: "a", hostname: "a", osName: "Debian 13", osId: "debian", osVersionId: "13" } })
    const b = await prisma.asset.create({ data: { name: "b", hostname: "b", osName: "Debian 13", osId: "debian", osVersionId: "13" } })
    await job(a.id, "failed", 1, "boom")
    await job(a.id, "completed", 2)
    const all = await getScanStatuses()
    expect(all.size).toBe(2)
    expect(all.get(a.id)!.lastAttempt?.failed).toBe(false)
    expect(all.get(a.id)!.failedSince).toBe(0)
    expect(all.get(b.id)!.lastAttempt).toBeNull()
  })
})

describe("scanAllAssets", () => {
  beforeEach(async () => {
    await resetDb()
    mockedBatchSearch.mockReset().mockResolvedValue([])
  })

  it("returns the assets that failed with the error, and keeps going", async () => {
    const bad = await prisma.asset.create({ data: { name: "bad", hostname: "bad", osId: "debian", osVersionId: "13", osName: "Debian 13" } })
    const good = await prisma.asset.create({ data: { name: "good", hostname: "good", osId: "debian", osVersionId: "13", osName: "Debian 13" } })
    for (const a of [bad, good]) {
      await prisma.package.create({
        data: { assetId: a.id, name: "lodash", version: "4.17.20", rawVersion: "4.17.20", ecosystem: "npm", source: "sbom", deps: [] },
      })
    }
    mockedBatchSearch.mockRejectedValueOnce(new Error("heretix-api unreachable"))

    const result = await scanAllAssets()

    expect(result.total).toBe(2)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toContain("heretix-api unreachable")
    const statuses = await getScanStatuses()
    expect(statuses.get(result.failures[0].assetId)!.lastAttempt?.failed).toBe(true)
  })
})
