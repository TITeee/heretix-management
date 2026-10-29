import { describe, it, expect } from "vitest"
import { afterLoginPath } from "./login-redirect"

describe("afterLoginPath", () => {
  it("goes to the home page without a callback", () => {
    expect(afterLoginPath(null)).toBe("/")
    expect(afterLoginPath("")).toBe("/")
  })

  it("keeps the path and query of the page that was asked for", () => {
    expect(afterLoginPath("/alerts?status=open&page=2")).toBe("/alerts?status=open&page=2")
    expect(afterLoginPath("http://10.0.0.5:3000/assets/abc?tab=alerts")).toBe("/assets/abc?tab=alerts")
  })

  it("never leaves the site", () => {
    expect(afterLoginPath("https://evil.example/phish")).toBe("/phish")
    expect(afterLoginPath("//evil.example/phish")).toBe("/phish")
    expect(afterLoginPath("javascript:alert(1)")).toBe("/")
  })

  it("does not return to the login page or an API route", () => {
    expect(afterLoginPath("/login?callbackUrl=%2F")).toBe("/")
    expect(afterLoginPath("/api/alerts")).toBe("/")
  })
})
