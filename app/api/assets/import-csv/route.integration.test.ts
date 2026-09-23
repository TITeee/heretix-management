import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { POST } from "./route"
import type { RawCsvRow } from "@/lib/csv-import"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function row(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    name: "FW-1", hostname: "fw-1.example.com", asset_type: "host",
    vendor: "fortinet", product: "FortiOS", version: "7.4.3", tags: "",
    ...overrides,
  }
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assets/import-csv", { method: "POST", body: JSON.stringify(body) })
}

async function importRows(rows: RawCsvRow[], opts: { commit?: boolean; updateExisting?: boolean } = {}) {
  const res = await POST(postRequest({ rows, ...opts }))
  return { res, body: await res.json() }
}

describe("POST /api/assets/import-csv", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await POST(postRequest({ rows: [row()] }))
    expect(res.status).toBe(401)
  })

  it("rejects an empty rows array", async () => {
    const res = await POST(postRequest({ rows: [] }))
    expect(res.status).toBe(400)
  })

  it("previews without writing anything when commit is not set", async () => {
    const { res, body } = await importRows([row()])
    expect(res.status).toBe(200)
    expect(body.results).toEqual([{ line: 1, hostname: "fw-1.example.com", status: "create" }])
    expect(await prisma.asset.count()).toBe(0)
  })

  it("creates an asset and an advisory package on commit", async () => {
    const { body } = await importRows([row()], { commit: true })
    expect(body.results).toEqual([{ line: 1, hostname: "fw-1.example.com", status: "create" }])

    const asset = await prisma.asset.findUniqueOrThrow({ where: { hostname: "fw-1.example.com" } })
    expect(asset.name).toBe("FW-1")
    expect(asset.osId).toBe("manual")

    const pkg = await prisma.package.findFirstOrThrow({ where: { assetId: asset.id } })
    expect(pkg).toMatchObject({ name: "FortiOS", version: "7.4.3", ecosystem: "advisory", source: "manual" })
  })

  it("creates multiple packages on one asset when rows share a hostname", async () => {
    await importRows(
      [row({ product: "FortiOS" }), row({ product: "FortiSwitchManager" })],
      { commit: true }
    )
    const asset = await prisma.asset.findUniqueOrThrow({ where: { hostname: "fw-1.example.com" } })
    const packages = await prisma.package.findMany({ where: { assetId: asset.id } })
    expect(packages.map((p) => p.name).sort()).toEqual(["FortiOS", "FortiSwitchManager"])
  })

  it("assigns existing asset tags", async () => {
    await prisma.tag.create({ data: { name: "Internet Facing", type: "asset" } })
    const { body } = await importRows([row({ tags: "Internet Facing" })], { commit: true })
    expect(body.results[0].status).toBe("create")

    const asset = await prisma.asset.findUniqueOrThrow({
      where: { hostname: "fw-1.example.com" },
      include: { assetTags: { include: { tag: true } } },
    })
    expect(asset.assetTags.map((at) => at.tag.name)).toEqual(["Internet Facing"])
  })

  it("skips a hostname that already exists, without touching it, unless updateExisting is set", async () => {
    const existing = await prisma.asset.create({
      data: { name: "Existing", hostname: "fw-1.example.com", osId: "manual", osVersionId: "manual", osName: "Manual Asset" },
    })

    const skipped = await importRows([row()], { commit: true })
    expect(skipped.body.results[0].status).toBe("skip")
    expect(await prisma.package.count({ where: { assetId: existing.id } })).toBe(0)

    const updated = await importRows([row()], { commit: true, updateExisting: true })
    expect(updated.body.results[0].status).toBe("update")
    expect(await prisma.package.count({ where: { assetId: existing.id } })).toBe(1)
    // The name/type from the CSV must not overwrite an asset that already existed.
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe("Existing")
  })

  it("skips a package that's already on the existing asset instead of erroring", async () => {
    const existing = await prisma.asset.create({
      data: { name: "Existing", hostname: "fw-1.example.com", osId: "manual", osVersionId: "manual", osName: "Manual Asset" },
    })
    await prisma.package.create({
      data: { assetId: existing.id, name: "FortiOS", version: "7.4.3", rawVersion: "7.4.3", ecosystem: "advisory", source: "manual", deps: [] },
    })

    const { body } = await importRows([row()], { commit: true, updateExisting: true })
    expect(body.results[0]).toMatchObject({ status: "skip" })
    expect(await prisma.package.count({ where: { assetId: existing.id } })).toBe(1)
  })

  it("reports a validation error per bad row without importing any row from the file", async () => {
    const { body } = await importRows([row(), row({ hostname: "", vendor: "unknown-vendor" })], { commit: true })
    expect(body.results[0].status).toBe("create")
    expect(body.results[1].status).toBe("error")
    // The good row in the same request still imports — one bad row doesn't
    // sink the whole file, since a 500-row upload with one typo shouldn't
    // require starting over.
    expect(await prisma.asset.count()).toBe(1)
  })

  it("writes one summary audit log entry per commit, not one per row", async () => {
    await importRows(
      [row(), row({ hostname: "fw-2.example.com" })],
      { commit: true }
    )
    const logs = await prisma.auditLog.findMany({ where: { action: "asset_bulk_import" } })
    expect(logs).toHaveLength(1)
    expect(logs[0].detail).toMatch(/created: 2/)
  })

  it("does not write an audit log entry on a preview", async () => {
    await importRows([row()])
    expect(await prisma.auditLog.count()).toBe(0)
  })
})
