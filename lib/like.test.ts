import { describe, it, expect } from "vitest"
import { escapeLike } from "./like"

describe("escapeLike", () => {
  it("puts a backslash before %, _ and the backslash itself", () => {
    expect(escapeLike("100%")).toBe("100\\%")
    expect(escapeLike("a_b")).toBe("a\\_b")
    expect(escapeLike("C:\\temp")).toBe("C:\\\\temp")
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\")
  })

  it("leaves other text alone", () => {
    expect(escapeLike("web-01.example.com")).toBe("web-01.example.com")
    expect(escapeLike("")).toBe("")
    expect(escapeLike("日本語 'quoted' \"double\"")).toBe("日本語 'quoted' \"double\"")
  })
})
