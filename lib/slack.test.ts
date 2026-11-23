import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const settings: { key: string; value: string }[] = []
vi.mock("@/lib/db", () => ({
  prisma: { setting: { findMany: vi.fn(async () => settings) } },
}))

import { notifySlackIfNeeded, type AlertSummary } from "./slack"

const fetchMock = vi.fn()

beforeEach(() => {
  settings.length = 0
  settings.push(
    { key: "SLACK_ENABLED", value: "true" },
    { key: "SLACK_WEBHOOK_URL", value: "https://hooks.slack.test/x" },
  )
  fetchMock.mockReset().mockResolvedValue({ ok: true })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const alert = (over: Partial<AlertSummary> = {}): AlertSummary => ({
  packageName: "openssl",
  packageVersion: "3.0.2",
  externalId: "CVE-2026-0001",
  severity: "HIGH",
  cvssScore: 7.5,
  note: "fixed in 3.0.13",
  ...over,
})

const sentText = () => JSON.parse(fetchMock.mock.calls[0][1].body).text as string

describe("Slack notice: a fix appeared", () => {
  it("lists each alert with the version that fixes it", async () => {
    await notifySlackIfNeeded({ assetName: "web-01", assetTagIds: [], triggerType: "fix_available", alerts: [alert()] })
    const text = sentText()
    expect(text).toContain("1 alert(s) now have a fix* on *web-01*")
    expect(text).toContain("CVE-2026-0001  openssl 3.0.2  HIGH  (fixed in 3.0.13)")
  })

  it("shows ten and counts the rest", async () => {
    const many = Array.from({ length: 13 }, (_, i) => alert({ externalId: `CVE-2026-${1000 + i}` }))
    await notifySlackIfNeeded({ assetName: "web-01", assetTagIds: [], triggerType: "fix_available", alerts: many })
    const text = sentText()
    expect(text).toContain("13 alert(s) now have a fix")
    expect(text).toContain("CVE-2026-1009")
    expect(text).not.toContain("CVE-2026-1010")
    expect(text).toContain("…and 3 more")
  })

  it("obeys the minimum severity, unlike a KEV addition", async () => {
    settings.push({ key: "SLACK_MIN_SEVERITY", value: "HIGH" })
    await notifySlackIfNeeded({
      assetName: "web-01", assetTagIds: [], triggerType: "fix_available",
      alerts: [alert({ severity: "MEDIUM", cvssScore: 5.0 })],
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await notifySlackIfNeeded({
      assetName: "web-01", assetTagIds: [], triggerType: "fix_available",
      alerts: [alert({ severity: "MEDIUM", cvssScore: 5.0 }), alert({ externalId: "CVE-2026-0002" })],
    })
    expect(sentText()).toContain("1 alert(s) now have a fix")
    expect(sentText()).toContain("CVE-2026-0002")
  })

  it("still announces a reopened alert as before", async () => {
    await notifySlackIfNeeded({ assetName: "web-01", assetTagIds: [], triggerType: "reopened", alerts: [alert({ note: "fix now available: 3.0.13" })] })
    expect(sentText()).toContain("1 alert(s) reopened* on *web-01*")
    expect(sentText()).toContain("(fix now available: 3.0.13)")
  })
})
