import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { refreshSessionToken } from "./session-token"

async function signedIn(role = "admin") {
  const user = await prisma.user.create({ data: { email: "a@example.com", password: "x", name: "A", role } })
  // What the jwt callback puts in the token at sign-in.
  return { user, token: { id: user.id, role: user.role, sessionVersion: user.sessionVersion, email: user.email, name: user.name } }
}

describe("refreshSessionToken", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("keeps the session of a user that is unchanged", async () => {
    const { token } = await signedIn()
    await expect(refreshSessionToken(token)).resolves.toMatchObject({ role: "admin", email: "a@example.com" })
  })

  it("signs out a deleted user at once, not when the token expires", async () => {
    const { user, token } = await signedIn()
    await prisma.user.delete({ where: { id: user.id } })
    await expect(refreshSessionToken(token)).resolves.toBeNull()
  })

  it("takes the role from the database, so an admin made an operator loses admin at once", async () => {
    const { user, token } = await signedIn("admin")
    await prisma.user.update({ where: { id: user.id }, data: { role: "operator", email: "b@example.com" } })
    await expect(refreshSessionToken(token)).resolves.toMatchObject({ role: "operator", email: "b@example.com" })
  })

  it("signs out the sessions opened before a password change", async () => {
    const { user, token } = await signedIn()
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
    await expect(refreshSessionToken(token)).resolves.toBeNull()
  })

  it("signs out a token from before sessionVersion existed", async () => {
    const { token } = await signedIn()
    await expect(refreshSessionToken({ ...token, sessionVersion: undefined })).resolves.toBeNull()
  })
})

describe("User defaults", () => {
  beforeEach(async () => {
    await resetDb()
  })

  it("makes a user created without a role an operator", async () => {
    const user = await prisma.user.create({ data: { email: "c@example.com", password: "x" } })
    expect(user.role).toBe("operator")
  })
})
