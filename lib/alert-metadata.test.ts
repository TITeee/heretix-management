import { describe, it, expect } from "vitest"
import { diffAlertMetadata, type AlertMetadataUpdate } from "./alert-metadata"
import { DEFAULT_SLA_CONFIG } from "./sla"

const alert = {
  packageName: "openssl",
  packageVersion: "3.0.2",
  externalId: "CVE-2026-0001",
  detectedAt: new Date("2026-11-01T00:00:00Z"),
  status: "open",
  cvssScore: 7.5,
  cvssVector: null,
  severity: "HIGH",
  isKev: false,
  epssScore: null,
  epssPercentile: null,
  fixedVersion: null as string | null,
}

const incoming = (over: Partial<AlertMetadataUpdate> = {}): AlertMetadataUpdate => ({
  cvssScore: 7.5,
  cvssVector: null,
  severity: "HIGH",
  summary: null,
  isKev: false,
  epssScore: null,
  epssPercentile: null,
  fixedVersion: null,
  ...over,
})

describe("diffAlertMetadata: fix available", () => {
  it("records the event and a Slack summary when an open alert with no fix gets one", () => {
    const diff = diffAlertMetadata(alert, incoming({ fixedVersion: "3.0.13" }), DEFAULT_SLA_CONFIG)
    expect(diff.changed).toBe(true)
    expect(diff.data.fixedVersion).toBe("3.0.13")
    expect(diff.events).toEqual([{ type: "fix_available", data: { fixedVersion: "3.0.13" } }])
    expect(diff.slack.fixAvailable).toMatchObject({
      packageName: "openssl", packageVersion: "3.0.2", externalId: "CVE-2026-0001", severity: "HIGH", note: "fixed in 3.0.13",
    })
  })

  it("treats an empty string like no fix", () => {
    const diff = diffAlertMetadata({ ...alert, fixedVersion: "" }, incoming({ fixedVersion: "3.0.13" }), DEFAULT_SLA_CONFIG)
    expect(diff.slack.fixAvailable).toBeDefined()
  })

  it("is quiet when the fixed version only changes", () => {
    const diff = diffAlertMetadata({ ...alert, fixedVersion: "3.0.10" }, incoming({ fixedVersion: "3.0.13" }), DEFAULT_SLA_CONFIG)
    expect(diff.changed).toBe(true)
    expect(diff.data.fixedVersion).toBe("3.0.13")
    expect(diff.events).toEqual([])
    expect(diff.slack.fixAvailable).toBeUndefined()
  })

  it("is quiet when the fix is withdrawn, or there still is none", () => {
    expect(diffAlertMetadata({ ...alert, fixedVersion: "3.0.13" }, incoming({ fixedVersion: null }), DEFAULT_SLA_CONFIG).events).toEqual([])
    const same = diffAlertMetadata(alert, incoming(), DEFAULT_SLA_CONFIG)
    expect(same.changed).toBe(false)
    expect(same.slack).toEqual({})
  })

  it("also fires for an alert that is in progress", () => {
    const diff = diffAlertMetadata({ ...alert, status: "in_progress" }, incoming({ fixedVersion: "3.0.13" }), DEFAULT_SLA_CONFIG)
    expect(diff.events).toEqual([{ type: "fix_available", data: { fixedVersion: "3.0.13" } }])
    expect(diff.slack.fixAvailable).toMatchObject({ externalId: "CVE-2026-0001", note: "fixed in 3.0.13" })
  })

  it.each(["ignored", "resolved"])("is quiet for an alert that is %s", (status) => {
    const diff = diffAlertMetadata({ ...alert, status }, incoming({ fixedVersion: "3.0.13" }), DEFAULT_SLA_CONFIG)
    expect(diff.data.fixedVersion).toBe("3.0.13")
    expect(diff.events).toEqual([])
    expect(diff.slack.fixAvailable).toBeUndefined()
  })

  it("is not raised by a caller that has no per-match fixed version (the metadata refresh)", () => {
    const { fixedVersion: _omit, ...withoutFix } = incoming()
    const diff = diffAlertMetadata(alert, withoutFix, DEFAULT_SLA_CONFIG)
    expect(diff.changed).toBe(false)
    expect(diff.slack.fixAvailable).toBeUndefined()
  })

  it("can arrive together with the other changes", () => {
    const diff = diffAlertMetadata(alert, incoming({ fixedVersion: "3.0.13", isKev: true }), DEFAULT_SLA_CONFIG)
    expect(diff.events.map((e) => e.type)).toEqual(["kev_added", "fix_available"])
    expect(diff.slack.kevAdded).toBeDefined()
    expect(diff.slack.fixAvailable).toBeDefined()
  })
})
