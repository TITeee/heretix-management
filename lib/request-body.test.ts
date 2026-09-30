import { describe, it, expect } from "vitest"
import { stringList } from "./request-body"

describe("stringList", () => {
  it("trims entries and drops blanks and duplicates", () => {
    expect(stringList([" a ", "b", "", "a", "  "])).toEqual(["a", "b"])
  })

  it("rejects anything that isn't a non-empty array of strings", () => {
    expect(stringList(undefined)).toBeNull()
    expect(stringList("a")).toBeNull()
    expect(stringList([])).toBeNull()
    expect(stringList(["", " "])).toBeNull()
    expect(stringList(["a", 1])).toBeNull()
  })
})
