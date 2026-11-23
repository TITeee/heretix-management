import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const admin = { user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin" } }

const get = (query: string) => GET(new NextRequest(`http://localhost/api/settings/retention${query}`))
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000)

describe("GET /api/settings/retention", () => {
  beforeEach(async () => {
    await resetDb()
    mockedAuth.mockResolvedValue(admin)
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("says what a period would delete, without deleting it", async () => {
    await prisma.auditLog.createMany({ data: [{ action: "old", createdAt: daysAgo(400) }, { action: "new", createdAt: daysAgo(3) }] })
    const body = await (await get("?auditDays=365&scanDays=")).json()
    expect(body.audit).toMatchObject({ total: 2, expired: 1, minDays: 90 })
    expect(body.scan).toMatchObject({ total: 0, expired: 0, minDays: 30, keptPerAsset: 10 })
    expect(await prisma.auditLog.count()).toBe(2)
  })

  it("reports nothing to delete when no period is given", async () => {
    await prisma.auditLog.create({ data: { action: "old", createdAt: daysAgo(4000) } })
    const body = await (await get("")).json()
    expect(body.audit).toMatchObject({ total: 1, expired: 0 })
  })

  it("refuses a period the settings would refuse", async () => {
    expect((await get("?auditDays=10")).status).toBe(400)
    expect((await get("?scanDays=abc")).status).toBe(400)
  })

  it("is for admins only", async () => {
    mockedAuth.mockResolvedValue({ user: { ...admin.user, role: "operator" } })
    expect((await get("?auditDays=365")).status).toBe(401)
    mockedAuth.mockResolvedValue(null)
    expect((await get("?auditDays=365")).status).toBe(401)
  })
})
