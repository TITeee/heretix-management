import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { hashApiToken } from "@/lib/api-token"
import { GET, POST } from "./route"
import { DELETE } from "./[id]/route"
import { POST as REVOKE } from "./[id]/revoke/route"

const idParams = (id: string) => ({ params: Promise.resolve({ id }) })
const revokeRequest = (id: string) => new NextRequest(`http://localhost/api/settings/api-tokens/${id}/revoke`, { method: "POST" })
const deleteRequest = (id: string) => new NextRequest(`http://localhost/api/settings/api-tokens/${id}`, { method: "DELETE" })

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/settings/api-tokens", { method: "POST", body: JSON.stringify(body) })
}

describe("/api/settings/api-tokens", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("creates a token, returning the plaintext once and storing only its hash", async () => {
    const res = await POST(createRequest({ name: "ci", scopes: ["import", "scan"], expiresInDays: 90 }))
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created.token).toMatch(/^hx_/)
    expect(created).toMatchObject({ name: "ci", scopes: ["import", "scan"], createdByEmail: "admin@example.com" })

    const row = await prisma.apiToken.findFirstOrThrow()
    expect(row.tokenHash).toBe(hashApiToken(created.token))
    expect(JSON.stringify(row)).not.toContain(created.token)
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000)
    expect(Math.round(days)).toBe(90)

    const list = await (await GET()).json()
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty("token")
    expect(list[0]).not.toHaveProperty("tokenHash")

    expect(await prisma.auditLog.count({ where: { action: "api_token_created" } })).toBe(1)
  })

  it.each([
    [{ scopes: ["import"], expiresInDays: 30 }, "name is required"],
    [{ name: "ci", scopes: [], expiresInDays: 30 }, "scopes"],
    [{ name: "ci", scopes: ["admin"], expiresInDays: 30 }, "scopes"],
    [{ name: "ci", scopes: ["import"] }, "expiresInDays"],
    [{ name: "ci", scopes: ["import"], expiresInDays: 0 }, "expiresInDays"],
    [{ name: "ci", scopes: ["import"], expiresInDays: 366 }, "expiresInDays"],
  ])("rejects %j", async (body, message) => {
    const res = await POST(createRequest(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(message)
    expect(await prisma.apiToken.count()).toBe(0)
  })

  it("revokes a token, keeping its row", async () => {
    const { id } = await (await POST(createRequest({ name: "ci", scopes: ["import"], expiresInDays: 30 }))).json()
    const res = await REVOKE(revokeRequest(id), idParams(id))
    expect(res.status).toBe(200)
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id } })
    expect(row.revokedAt).not.toBeNull()
    expect(await prisma.auditLog.count({ where: { action: "api_token_revoked" } })).toBe(1)
  })

  it("refuses to delete an active token, and deletes it once revoked", async () => {
    const { id } = await (await POST(createRequest({ name: "ci", scopes: ["import"], expiresInDays: 30 }))).json()

    const active = await DELETE(deleteRequest(id), idParams(id))
    expect(active.status).toBe(409)
    expect(await prisma.apiToken.count()).toBe(1)

    await REVOKE(revokeRequest(id), idParams(id))
    const revoked = await DELETE(deleteRequest(id), idParams(id))
    expect(revoked.status).toBe(200)
    expect(await prisma.apiToken.count()).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: "api_token_deleted" } })).toBe(1)
  })

  it("deletes an expired token without revoking it first", async () => {
    const { id } = await (await POST(createRequest({ name: "ci", scopes: ["import"], expiresInDays: 30 }))).json()
    await prisma.apiToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await DELETE(deleteRequest(id), idParams(id))).status).toBe(200)
    expect(await prisma.apiToken.count()).toBe(0)
  })

  it("is admin-only", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u2", email: "viewer@example.com", name: "V", role: "viewer" } })
    try {
      expect((await GET()).status).toBe(403)
      expect((await POST(createRequest({ name: "ci", scopes: ["import"], expiresInDays: 30 }))).status).toBe(403)
    } finally {
      mockedAuth.mockResolvedValue({ user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin" } })
    }
  })
})
