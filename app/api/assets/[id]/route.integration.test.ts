import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { GET, PATCH, DELETE } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assets/a1", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

function patch(id: string, body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ id }) })
}

function get(id: string) {
  return GET(new NextRequest("http://localhost/api/assets/a1"), { params: Promise.resolve({ id }) })
}

function del(id: string) {
  return DELETE(new NextRequest("http://localhost/api/assets/a1", { method: "DELETE" }), { params: Promise.resolve({ id }) })
}

function createAsset(hostname: string) {
  return prisma.asset.create({
    data: { name: hostname, hostname, osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
  })
}

describe("GET/PATCH/DELETE /api/assets/[id]", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await patch("missing-id", { name: "x" })
    expect(res.status).toBe(401)
  })

  it("returns 404 for a missing asset", async () => {
    const res = await get("missing-id")
    expect(res.status).toBe(404)
  })

  it("updates name and hostname", async () => {
    const asset = await createAsset("host-1")
    const res = await patch(asset.id, { name: "renamed", hostname: "host-1-renamed" })
    expect(res.status).toBe(200)
    const updated = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(updated.name).toBe("renamed")
    expect(updated.hostname).toBe("host-1-renamed")
  })

  // Regression test: PATCH previously had no duplicate-hostname handling at
  // all, so renaming an asset onto an existing hostname succeeded silently —
  // breaking the "hostname is the matching key" invariant inventory import
  // relies on. The hostname @unique constraint plus withApiErrorHandling's
  // P2002 mapping should now turn this into a clean 409 instead.
  it("rejects renaming an asset's hostname to collide with another asset", async () => {
    await createAsset("host-1")
    const other = await createAsset("host-2")
    const res = await patch(other.id, { hostname: "host-1" })
    expect(res.status).toBe(409)

    const unchanged = await prisma.asset.findUniqueOrThrow({ where: { id: other.id } })
    expect(unchanged.hostname).toBe("host-2")
  })

  it("returns 404 when patching a missing asset", async () => {
    const res = await patch("missing-id", { name: "x" })
    expect(res.status).toBe(404)
  })

  it("deletes an asset and logs an audit event", async () => {
    const asset = await createAsset("host-1")
    const res = await del(asset.id)
    expect(res.status).toBe(204)
    expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull()

    const logs = await prisma.auditLog.findMany({ where: { action: "asset_deleted" } })
    expect(logs).toHaveLength(1)
    expect(logs[0].target).toBe("host-1")
  })

  it("returns 404 when deleting a missing asset", async () => {
    const res = await del("missing-id")
    expect(res.status).toBe(404)
  })
})
