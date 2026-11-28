import { describe, it, expect } from "vitest"
import { ownVersions, osvRangeLabel, isOwnOsvPackage, ownOsvRecordsFirst } from "./osv-own-versions"

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

describe("isOwnOsvPackage", () => {
  const curl = { ecosystem: "Debian:13", packageName: "curl" }
  it("needs the alert's ecosystem and its package or source package", () => {
    expect(isOwnOsvPackage(curl, { ecosystem: "Debian:13", packageName: "curl" })).toBe(true)
    expect(isOwnOsvPackage(curl, { ecosystem: "Debian:13", packageName: "libcurl4", sourcePackage: "curl" })).toBe(true)
    expect(isOwnOsvPackage(curl, { ecosystem: "Debian:12", packageName: "curl" })).toBe(false)
    expect(isOwnOsvPackage(curl, { ecosystem: "Debian:13", packageName: "wget" })).toBe(false)
    expect(isOwnOsvPackage(curl, null)).toBe(false)
  })
})

describe("ownOsvRecordsFirst", () => {
  // CVE-2024-6387 style: several OSV records for one CVE, only one with the alert's own entry.
  const ubuntu = { osvId: "UBUNTU-CVE-1", affectedPackages: [{ ecosystem: "Ubuntu:22.04:LTS", packageName: "openssh" }] }
  const debian = { osvId: "DEBIAN-CVE-1", affectedPackages: [{ ecosystem: "Debian:11", packageName: "openssh" }, { ecosystem: "Debian:12", packageName: "openssh" }] }
  const alpine = { osvId: "ALPINE-CVE-1", affectedPackages: [{ ecosystem: "Alpine:v3.20", packageName: "openssh" }] }
  const alert = { ecosystem: "Debian:12", packageName: "openssh" }

  it("puts the records with an entry of the alert's own first and keeps the rest in order", () => {
    expect(ownOsvRecordsFirst([ubuntu, alpine, debian], alert).map((r) => r.osvId)).toEqual(["DEBIAN-CVE-1", "UBUNTU-CVE-1", "ALPINE-CVE-1"])
  })

  it("leaves the order alone with no alert or no own record, and does not change its input", () => {
    const input = [ubuntu, alpine, debian]
    expect(ownOsvRecordsFirst(input, null).map((r) => r.osvId)).toEqual(["UBUNTU-CVE-1", "ALPINE-CVE-1", "DEBIAN-CVE-1"])
    expect(ownOsvRecordsFirst(input, { ecosystem: "npm", packageName: "x" }).map((r) => r.osvId)).toEqual(["UBUNTU-CVE-1", "ALPINE-CVE-1", "DEBIAN-CVE-1"])
    expect(input.map((r) => r.osvId)).toEqual(["UBUNTU-CVE-1", "ALPINE-CVE-1", "DEBIAN-CVE-1"])
  })
})
