import { describe, it, expect } from "vitest"
import { isApiTokenRequest } from "./auth.config"

// proxy.ts gates every request on a session; this is the one exception it makes.
describe("isApiTokenRequest", () => {
  it("lets a bearer request through to the token routes only", () => {
    expect(isApiTokenRequest("/api/assets", "Bearer hx_abc")).toBe(true)
    expect(isApiTokenRequest("/api/assets/cm123/scan", "bearer hx_abc")).toBe(true)

    expect(isApiTokenRequest("/api/assets/cm123", "Bearer hx_abc")).toBe(false)
    expect(isApiTokenRequest("/api/alerts", "Bearer hx_abc")).toBe(false)
    expect(isApiTokenRequest("/api/settings/api-tokens", "Bearer hx_abc")).toBe(false)
    expect(isApiTokenRequest("/assets", "Bearer hx_abc")).toBe(false)
  })

  it("requires a bearer Authorization header", () => {
    expect(isApiTokenRequest("/api/assets", null)).toBe(false)
    expect(isApiTokenRequest("/api/assets", "Basic dXNlcjpwYXNz")).toBe(false)
  })
})
