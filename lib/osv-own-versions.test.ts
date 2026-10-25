import { describe, it, expect } from "vitest"
import { ownVersions, osvRangeLabel } from "./osv-own-versions"

// DEBIAN-CVE-2026-19931: one record, three Debian releases of curl.
const affected = [
  { package: { ecosystem: "Debian:12", name: "curl" }, versions: ["7.88.1-10", "8.14.1-2"] },
  { package: { ecosystem: "Debian:13", name: "curl" }, versions: ["8.14.1-1", "8.14.1-2", "8.14.1-2+deb13u2"] },
  { package: { ecosystem: "Debian:14", name: "curl" }, versions: ["8.14.1-2"] },
]
const alert = { ecosystem: "Debian:13", packageName: "curl", version: "8.14.1-2+deb13u2" }

describe("ownVersions", () => {
  it("lists the versions of the alert's own entry only, with the alert's version first", () => {
    expect(ownVersions(affected, alert)).toEqual({
      versions: ["8.14.1-2+deb13u2", "8.14.1-1", "8.14.1-2"],
      hasOwnVersion: true,
    })
  })

  it("keeps the entry's order and says so when the alert's version is not listed (the range matched)", () => {
    expect(ownVersions(affected, { ...alert, version: "8.14.1-3" })).toEqual({
      versions: ["8.14.1-1", "8.14.1-2", "8.14.1-2+deb13u2"],
      hasOwnVersion: false,
    })
  })

  it("finds the entry of the source package", () => {
    const entries = [{ package: { ecosystem: "Debian:13", name: "util-linux" }, versions: ["2.41-5"] }]
    const result = ownVersions(entries, { ecosystem: "Debian:13", packageName: "bsdutils", sourcePackage: "util-linux", version: "2.41-5" })
    expect(result).toEqual({ versions: ["2.41-5"], hasOwnVersion: true })
  })

  it("returns an own entry with no versions as an empty list", () => {
    expect(ownVersions([{ package: { ecosystem: "Debian:13", name: "curl" } }], alert)).toEqual({ versions: [], hasOwnVersion: false })
  })

  it("returns null when the record has no entry for the alert, or there is no alert", () => {
    expect(ownVersions(affected, { ...alert, ecosystem: "Debian:11" })).toBeNull()
    expect(ownVersions(affected, { ...alert, packageName: "wget" })).toBeNull()
    expect(ownVersions(affected, null)).toBeNull()
    expect(ownVersions(undefined, alert)).toBeNull()
  })
})

describe("osvRangeLabel", () => {
  const range = (introducedVersion: string | null, fixedVersion: string | null, lastAffectedVersion: string | null = null) => ({ introducedVersion, fixedVersion, lastAffectedVersion })

  it("leaves out an introduced 0, which means from the first version", () => {
    expect(osvRangeLabel(range("0", null))).toBe("All versions")
    expect(osvRangeLabel(range("0", "8.22.0"))).toBe("< 8.22.0")
    expect(osvRangeLabel(range("0", null, "5.0"))).toBe("≤ 5.0")
  })

  it("keeps a real lower bound", () => {
    expect(osvRangeLabel(range("7.64.1", "8.22.0"))).toBe("≥ 7.64.1, < 8.22.0")
    expect(osvRangeLabel(range("7.64.1", null))).toBe("≥ 7.64.1")
  })

  it("says n/a when the entry has no range at all", () => {
    expect(osvRangeLabel(range(null, null))).toBe("n/a")
  })
})
