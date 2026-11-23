import { describe, it, expect, vi, beforeEach } from "vitest"

const createAuditLog = vi.fn()
vi.mock("@/lib/audit", () => ({ createAuditLog: (...args: unknown[]) => createAuditLog(...args) }))

import { auditFailedSignIn, clip, MAX_EMAIL_LENGTH } from "./signin-audit"
import { claimFailedSignInAudit, MAX_FAILED_SIGNIN_AUDITS } from "./rate-limit"

const WINDOW_MS = 15 * 60 * 1000
// The cap's window is module state: each test starts one window further on, so none sees another's count.
let base = 1_000_000_000_000
beforeEach(() => {
  createAuditLog.mockReset()
  base += 10 * WINDOW_MS
})

const fail = (now: number, over: Partial<Parameters<typeof auditFailedSignIn>[0]> = {}) =>
  auditFailedSignIn({ email: "a@example.com", reason: "invalid password", ip: "192.0.2.1", ...over }, now)

describe("claimFailedSignInAudit", () => {
  it("records up to the cap, says so once when it is passed, then skips", () => {
    const decisions = Array.from({ length: MAX_FAILED_SIGNIN_AUDITS + 3 }, () => claimFailedSignInAudit(base))
    expect(decisions.slice(0, MAX_FAILED_SIGNIN_AUDITS).every((d) => d === "record")).toBe(true)
    expect(decisions.slice(MAX_FAILED_SIGNIN_AUDITS)).toEqual(["summarize", "skip", "skip"])
  })

  it("starts counting again in the next window", () => {
    for (let i = 0; i < MAX_FAILED_SIGNIN_AUDITS + 5; i++) claimFailedSignInAudit(base)
    expect(claimFailedSignInAudit(base + WINDOW_MS - 1)).toBe("skip")
    expect(claimFailedSignInAudit(base + WINDOW_MS)).toBe("record")
  })
})

describe("auditFailedSignIn", () => {
  it("writes the row with who, why and from where", async () => {
    await fail(base, { userId: "u1" })
    expect(createAuditLog).toHaveBeenCalledWith({
      userId: "u1", userEmail: "a@example.com", action: "login_failed", detail: "invalid password (IP: 192.0.2.1)",
    })
  })

  it("cuts an email and an address that are longer than any real one", async () => {
    await fail(base, { email: `${"x".repeat(5000)}@example.com`, ip: "9".repeat(500) })
    const row = createAuditLog.mock.calls[0][0]
    expect(row.userEmail).toBe(`${"x".repeat(MAX_EMAIL_LENGTH)}…`)
    expect(row.detail).toBe(`invalid password (IP: ${"9".repeat(64)}…)`)
  })

  it("keeps the table from growing without bound: one summary row after the cap, then nothing", async () => {
    for (let i = 0; i < MAX_FAILED_SIGNIN_AUDITS + 200; i++) await fail(base, { email: `user${i}@example.com`, ip: `198.51.100.${i % 250}` })
    expect(createAuditLog).toHaveBeenCalledTimes(MAX_FAILED_SIGNIN_AUDITS + 1)
    const summary = createAuditLog.mock.calls[MAX_FAILED_SIGNIN_AUDITS][0]
    expect(summary).toEqual({
      action: "login_failed",
      detail: `more than ${MAX_FAILED_SIGNIN_AUDITS} failed sign-ins in 15 minutes; the rest are not recorded here, see the application log`,
    })
    await fail(base + WINDOW_MS)
    expect(createAuditLog).toHaveBeenCalledTimes(MAX_FAILED_SIGNIN_AUDITS + 2)
  })
})

describe("clip", () => {
  it("leaves a short value alone", () => {
    expect(clip("abc", 3)).toBe("abc")
    expect(clip("abcd", 3)).toBe("abc…")
  })
})
