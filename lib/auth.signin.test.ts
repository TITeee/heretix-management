import { describe, it, expect, vi, beforeEach } from "vitest"

// next-auth is replaced so that the options handed to the Credentials provider, authorize
// among them, can be called directly.
type Authorize = (credentials: Record<string, unknown>, request: { headers: Headers }) => Promise<unknown>
const captured = vi.hoisted(() => ({ authorize: undefined as unknown as Authorize }))
const authorize: Authorize = (credentials, request) => captured.authorize(credentials, request)
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
  CredentialsSignin: class extends Error {},
}))
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: { authorize: Authorize }) => { captured.authorize = options.authorize; return options },
}))
vi.mock("@/lib/auth.config", () => ({ authConfig: {} }))
vi.mock("@/lib/session-token", () => ({ refreshSessionToken: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const findUnique = vi.fn()
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
const compare = vi.fn()
vi.mock("bcryptjs", () => ({ default: { compare: (...a: unknown[]) => compare(...a), hash: vi.fn().mockResolvedValue("dummy") } }))
const createAuditLog = vi.fn()
vi.mock("@/lib/audit", () => ({ createAuditLog: (...a: unknown[]) => createAuditLog(...a) }))

import "./auth"
import { MAX_FAILED_SIGNIN_AUDITS } from "./rate-limit"
import { MAX_EMAIL_LENGTH } from "./signin-audit"

const request = (ip = "192.0.2.1") => ({ headers: new Headers({ "x-forwarded-for": ip }) })
const user = { id: "u1", email: "admin@example.com", name: "Admin", role: "admin", sessionVersion: 1, password: "hash" }

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue(null)
  compare.mockReset().mockResolvedValue(false)
  createAuditLog.mockReset()
})

describe("sign-in audit rows", () => {
  it("records a wrong password and a successful sign-in as before", async () => {
    findUnique.mockResolvedValue(user)
    expect(await authorize({ email: "admin@example.com", password: "bad" }, request("203.0.113.1"))).toBeNull()
    compare.mockResolvedValue(true)
    expect(await authorize({ email: "admin@example.com", password: "good" }, request("203.0.113.1"))).toMatchObject({ id: "u1" })
    expect(createAuditLog.mock.calls.map(([row]) => [row.action, row.detail])).toEqual([
      ["login_failed", "invalid password (IP: 203.0.113.1)"],
      ["login", "IP: 203.0.113.1"],
    ])
  })

  it("does not look up an email no account can have, and keeps only its first characters", async () => {
    const long = `${"x".repeat(10_000)}@example.com`
    expect(await authorize({ email: long, password: "p" }, request("203.0.113.2"))).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    expect(compare).toHaveBeenCalledTimes(1) // still takes as long as an unknown account
    expect(createAuditLog.mock.calls[0][0].userEmail).toBe(`${"x".repeat(MAX_EMAIL_LENGTH)}…`)
  })

  it("keeps a flood of failures from different emails and addresses to the cap plus one summary row", async () => {
    for (let i = 0; i < MAX_FAILED_SIGNIN_AUDITS + 150; i++) {
      await authorize({ email: `flood${i}@example.com`, password: "p" }, request(`198.51.100.${(i % 250) + 1}`))
    }
    const failures = createAuditLog.mock.calls.filter(([row]) => row.action === "login_failed")
    // Earlier tests in this file may have used part of the window: the cap holds for the whole run.
    expect(failures.length).toBeLessThanOrEqual(MAX_FAILED_SIGNIN_AUDITS + 1)
    expect(failures.at(-1)![0].detail).toContain("the rest are not recorded here")
  })
})
