import { describe, it, expect } from "vitest"
import { isMaskedSecret, maskSecret } from "./settings-keys"

describe("maskSecret", () => {
  it("shows only the last 4 characters of a long secret", () => {
    expect(maskSecret("sk-ant-0123456789abcd")).toBe("••••abcd")
  })

  it("hides a short secret whole, and leaves an empty one empty", () => {
    expect(maskSecret("12345678")).toBe("••••")
    expect(maskSecret("")).toBe("")
  })

  it("is recognized when the page sends it back", () => {
    expect(isMaskedSecret(maskSecret("sk-ant-0123456789abcd"))).toBe(true)
    expect(isMaskedSecret("sk-ant-new-key")).toBe(false)
    expect(isMaskedSecret(undefined)).toBe(false)
  })
})
