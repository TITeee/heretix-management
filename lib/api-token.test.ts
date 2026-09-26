import { describe, it, expect } from "vitest"
import { generateApiToken, hashApiToken, isApiTokenScope, auditIdentity } from "./api-token"

describe("generateApiToken", () => {
  it("produces a prefixed, URL-safe token with 32 bytes of randomness", () => {
    const token = generateApiToken()
    expect(token).toMatch(/^hx_[A-Za-z0-9_-]{43}$/)
    expect(generateApiToken()).not.toBe(token)
  })
})

describe("hashApiToken", () => {
  it("is a deterministic SHA-256 hex digest that differs from the token", () => {
    const token = generateApiToken()
    expect(hashApiToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiToken(token)).toBe(hashApiToken(token))
    expect(hashApiToken(token)).not.toContain(token)
  })
})

describe("isApiTokenScope", () => {
  it("accepts only the defined scopes", () => {
    expect(isApiTokenScope("import")).toBe(true)
    expect(isApiTokenScope("scan")).toBe(true)
    expect(isApiTokenScope("admin")).toBe(false)
    expect(isApiTokenScope(undefined)).toBe(false)
  })
})

describe("auditIdentity", () => {
  it("records a token actor by name, with no user id", () => {
    expect(auditIdentity({ via: "token", tokenId: "t1", tokenName: "ci", scopes: ["import"] }))
      .toEqual({ userId: null, userEmail: "api-token:ci" })
    expect(auditIdentity({ via: "session", userId: "u1", userEmail: "a@example.com" }))
      .toEqual({ userId: "u1", userEmail: "a@example.com" })
  })
})
