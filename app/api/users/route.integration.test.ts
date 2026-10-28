import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { POST } from "./route"
import { PATCH } from "./[id]/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "admin-1", email: "admin@example.com", name: "Admin", role: "admin" } }),
}))

const create = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/users", { method: "POST", body: JSON.stringify(body) }))
const update = (id: string, body: unknown) =>
  PATCH(new NextRequest(`http://localhost/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe("/api/users", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("refuses a password shorter than 12 characters, or one bcrypt would cut", async () => {
    const short = await create({ email: "u@example.com", password: "short-pass" })
    expect(short.status).toBe(400)
    expect((await short.json()).error).toMatch(/at least 12/)
    expect((await create({ email: "u@example.com", password: "a".repeat(73) })).status).toBe(400)
    expect(await prisma.user.count()).toBe(0)

    const ok = await create({ email: "u@example.com", password: "long-enough-pass" })
    expect(ok.status).toBe(201)
    expect((await ok.json()).role).toBe("operator")
  })

  it("applies the rule to a password change, and signs the user out of every session", async () => {
    const user = await prisma.user.create({ data: { email: "u@example.com", password: "x" } })
    expect((await update(user.id, { password: "short" })).status).toBe(400)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)

    expect((await update(user.id, { password: "a-new-long-password" })).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1)
    const log = await prisma.auditLog.findFirstOrThrow({ where: { target: "u@example.com" } })
    expect(log.action).toBe("user_password_reset")
  })

  it("leaves the sessions alone when only the name changes", async () => {
    const user = await prisma.user.create({ data: { email: "u@example.com", password: "x" } })
    expect((await update(user.id, { name: "New" })).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)
  })
})
