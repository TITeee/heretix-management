import { describe, it, expect } from "vitest"
import { passwordProblem } from "./password"

describe("passwordProblem", () => {
  it("accepts 12 characters or more", () => {
    expect(passwordProblem("a".repeat(12))).toBeNull()
    expect(passwordProblem("correct horse battery")).toBeNull()
  })

  it("refuses a shorter one, counting characters rather than bytes", () => {
    expect(passwordProblem("a".repeat(11))).toMatch(/at least 12/)
    // 11 characters, 21 bytes
    expect(passwordProblem("パスワード123456")).toMatch(/at least 12/)
    // 12 characters
    expect(passwordProblem("パスワード1234567")).toBeNull()
  })

  it("refuses one bcrypt would cut at 72 bytes", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull()
    expect(passwordProblem("a".repeat(73))).toMatch(/at most 72 bytes/)
    // 25 three-byte characters: 25 characters, 75 bytes
    expect(passwordProblem("あ".repeat(25))).toMatch(/at most 72 bytes/)
  })

  it("refuses what is not a string", () => {
    expect(passwordProblem(undefined)).toMatch(/required/)
    expect(passwordProblem(123456789012)).toMatch(/required/)
  })
})
