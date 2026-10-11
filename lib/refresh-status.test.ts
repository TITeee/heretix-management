import { describe, it, expect } from "vitest"
import { refreshFailed } from "@/lib/refresh-status"

describe("refreshFailed", () => {
  it("is failed when the refresh stopped with an error", () => {
    expect(refreshFailed({ total: 0, failed: 0, error: "db down" })).toBe(true)
  })

  it("is failed when half or more of the lookups failed", () => {
    expect(refreshFailed({ total: 10, failed: 5, error: null })).toBe(true)
    expect(refreshFailed({ total: 10, failed: 10, error: null })).toBe(true)
  })

  it("is not failed by a lookup or two, or by having nothing to look up", () => {
    expect(refreshFailed({ total: 10, failed: 4, error: null })).toBe(false)
    expect(refreshFailed({ total: 200, failed: 1, error: null })).toBe(false)
    expect(refreshFailed({ total: 0, failed: 0, error: null })).toBe(false)
  })
})
