import { describe, it, expect } from "vitest"
import { recentAlertsHref } from "./recent-link"
import { parseAlertQuery } from "./query-params"

const since = new Date("2026-11-27T05:30:12.345Z")

describe("recentAlertsHref", () => {
  it("opens the list on an asset's alerts detected since the instant, which the list reads back unchanged", () => {
    const href = recentAlertsHref({ assetId: "cl9asset" }, since)
    expect(href.startsWith("/alerts?")).toBe(true)
    const q = parseAlertQuery(new URL(href, "http://x").searchParams)
    expect(q).toMatchObject({ assetIds: ["cl9asset"], detectedFrom: "2026-11-27T05:30:12.345Z", detectedTo: null, statuses: ["open", "in_progress"] })
  })

  it("names the package and its version exactly, with characters that need escaping", () => {
    const href = recentAlertsHref({ packageName: "@babel/core", packageVersion: "1:2.38.1-5+deb12u1" }, since)
    const q = parseAlertQuery(new URL(href, "http://x").searchParams)
    expect(q).toMatchObject({ packageName: "@babel/core", packageVersion: "1:2.38.1-5+deb12u1", detectedFrom: "2026-11-27T05:30:12.345Z" })
  })
})
