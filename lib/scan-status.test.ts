import { describe, it, expect } from "vitest"
import { DEFAULT_STALE_HOURS, isScanStale } from "@/lib/scan-status"
import { buildScanFailureMessage } from "@/lib/slack"

const HOUR = 3_600_000
const now = new Date("2026-10-11T12:00:00Z")

describe("isScanStale", () => {
  it("is stale when no scan has ever succeeded", () => {
    expect(isScanStale(null, now)).toBe(true)
  })

  it("is not stale just inside the threshold and is just past it", () => {
    const limit = DEFAULT_STALE_HOURS * HOUR
    expect(isScanStale(new Date(now.getTime() - limit), now)).toBe(false)
    expect(isScanStale(new Date(now.getTime() - limit - 1), now)).toBe(true)
  })

  it("takes an explicit threshold", () => {
    expect(isScanStale(new Date(now.getTime() - 2 * HOUR), now, HOUR)).toBe(true)
  })
})

describe("buildScanFailureMessage", () => {
  it("groups assets that failed with the same error", () => {
    const msg = buildScanFailureMessage(10, [
      { assetName: "a", error: "fetch failed\nstack" },
      { assetName: "b", error: "fetch failed" },
      { assetName: "c", error: "timeout" },
    ], now)
    expect(msg).toContain("failed for 3 of 10")
    expect(msg).toContain("• 2 × fetch failed  (a, b)")
    expect(msg).toContain("• 1 × timeout  (c)")
    expect(msg).not.toContain("stack")
  })

  it("shortens long lists of names and of errors", () => {
    const names = Array.from({ length: 6 }, (_, i) => ({ assetName: `n${i}`, error: "same" }))
    expect(buildScanFailureMessage(6, names, now)).toContain("(n0, n1, n2, n3, and 2 more)")

    const errors = Array.from({ length: 7 }, (_, i) => ({ assetName: `n${i}`, error: `e${i}` }))
    expect(buildScanFailureMessage(7, errors, now)).toContain("and 2 other error(s)")
  })
})
