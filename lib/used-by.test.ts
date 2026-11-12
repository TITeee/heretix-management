import { describe, it, expect } from "vitest"
import { packageMatchesSearch, summarizeUsedBy, usedByOptions } from "./used-by"

describe("summarizeUsedBy", () => {
  it("shows the first two names and counts the rest", () => {
    expect(summarizeUsedBy(["a.service", "b.service", "c.service", "d.service"])).toEqual({ shown: ["a.service", "b.service"], more: 2 })
  })

  it("shows all of a short list, and nothing for none", () => {
    expect(summarizeUsedBy(["a.service"])).toEqual({ shown: ["a.service"], more: 0 })
    expect(summarizeUsedBy([])).toEqual({ shown: [], more: 0 })
    expect(summarizeUsedBy(undefined)).toEqual({ shown: [], more: 0 })
  })
})

describe("packageMatchesSearch", () => {
  const libssl = { name: "libssl3t64", usedBy: ["nginx.service", "ssh.service", "bash"] }

  it("matches by package name, as the search box always did", () => {
    expect(packageMatchesSearch(libssl, "ssl")).toBe(true)
    expect(packageMatchesSearch(libssl, "LIBSSL")).toBe(true)
    expect(packageMatchesSearch(libssl, "curl")).toBe(false)
  })

  it("also matches by a service that uses the package, so nginx finds what nginx has loaded", () => {
    expect(packageMatchesSearch(libssl, "nginx")).toBe(true)
    expect(packageMatchesSearch(libssl, "Nginx.Service")).toBe(true)
    expect(packageMatchesSearch(libssl, "bash")).toBe(true)
  })

  it("matches a package with no used-by by name only, and an empty query matches everything", () => {
    expect(packageMatchesSearch({ name: "tzdata" }, "nginx")).toBe(false)
    expect(packageMatchesSearch({ name: "tzdata", usedBy: [] }, "tz")).toBe(true)
    expect(packageMatchesSearch({ name: "tzdata" }, "")).toBe(true)
  })
})

describe("usedByOptions", () => {
  it("lists each name once, sorted, over all the packages", () => {
    expect(usedByOptions([
      { usedBy: ["ssh.service", "nginx.service"] },
      { usedBy: ["nginx.service", "bash"] },
      {},
      { usedBy: [] },
    ])).toEqual(["bash", "nginx.service", "ssh.service"])
  })

  it("is empty when no package says what uses it, which hides the filter", () => {
    expect(usedByOptions([{}, { usedBy: [] }])).toEqual([])
  })
})
