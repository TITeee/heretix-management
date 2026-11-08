import { describe, it, expect } from "vitest"
import { escapeCSV } from "./csv"

describe("escapeCSV", () => {
  // Upstream text and text users type would run as a formula in a spreadsheet
  // if it started like one.
  it("makes a value that would start a formula text", () => {
    expect(escapeCSV('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    for (const v of ["+1+1", "-1+1", "@SUM(A1)", "\tx", "\rx"]) expect(escapeCSV(v)).toBe(`"'${v}"`)
  })

  it("leaves other text and numbers as they are", () => {
    expect(escapeCSV("openssl")).toBe('"openssl"')
    expect(escapeCSV("a=b")).toBe('"a=b"')
    expect(escapeCSV(-1.5)).toBe('"-1.5"')
    expect(escapeCSV(null)).toBe('""')
  })
})
