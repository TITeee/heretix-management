import { describe, it, expect } from "vitest"
import { collectWorkarounds } from "./workarounds"

const rhel = { ecosystem: "Red Hat:9", packageName: "kernel", sourcePackage: "kernel" }
const fortios = { ecosystem: "advisory", packageName: "FortiOS" }

const adv = (source: string, externalId: string, workaround: string | null, rows: { vendor: string; product: string }[] = []) =>
  ({ source, externalId, workaround, affectedProducts: rows })

describe("collectWorkarounds", () => {
  it("takes the alert's own Red Hat VEX workaround and the CNA's, each with its source", () => {
    const detail = {
      advisoryVulnerabilities: [adv("red-hat-vex", "CVE-2024-1", "Blacklist the module.", [{ vendor: "red-hat-9", product: "kernel" }])],
      cnaWorkaround: "Disable the service.",
      cnaProvider: "redhat",
    }
    expect(collectWorkarounds(detail, rhel)).toEqual([
      { text: "Blacklist the module.", sources: ["Red Hat VEX"] },
      { text: "Disable the service.", sources: ["CNA: redhat"] },
    ])
  })

  it("shows the same text from two sources once, with both", () => {
    const detail = {
      advisoryVulnerabilities: [adv("red-hat-vex", "CVE-2024-1", "Blacklist the module.\n", [{ vendor: "red-hat-9", product: "kernel" }])],
      cnaWorkaround: "Blacklist the module.",
      cnaProvider: "redhat",
    }
    expect(collectWorkarounds(detail, rhel)).toEqual([{ text: "Blacklist the module.", sources: ["Red Hat VEX", "CNA: redhat"] }])
  })

  it("takes a Red Hat VEX advisory with no rows for a Red Hat alert only", () => {
    const detail = { advisoryVulnerabilities: [adv("red-hat-vex", "CVE-2024-1", "Mitigation is not available.")] }
    expect(collectWorkarounds(detail, rhel)).toEqual([{ text: "Mitigation is not available.", sources: ["Red Hat VEX"] }])
    expect(collectWorkarounds(detail, { ecosystem: "Oracle Linux:9", packageName: "kernel" })).toEqual([])
    expect(collectWorkarounds(detail, { ecosystem: "Debian:13", packageName: "linux" })).toEqual([])
  })

  it("leaves out another release's or another package's advisory", () => {
    const detail = {
      advisoryVulnerabilities: [
        adv("red-hat-vex", "CVE-2024-1", "For RHEL 10.", [{ vendor: "red-hat-10", product: "kernel" }]),
        adv("red-hat-vex", "CVE-2024-2", "For another package.", [{ vendor: "red-hat-9", product: "openssh" }]),
      ],
    }
    expect(collectWorkarounds(detail, rhel)).toEqual([])
  })

  it("takes a vendor advisory naming a manually added product, whatever the case", () => {
    const detail = {
      advisoryVulnerabilities: [
        adv("fortinet", "FG-IR-24-015", "Disable the SSL-VPN.", [{ vendor: "fortinet", product: "fortios" }]),
        adv("fortinet", "FG-IR-24-016", "For FortiProxy.", [{ vendor: "fortinet", product: "FortiProxy" }]),
      ],
    }
    expect(collectWorkarounds(detail, fortios)).toEqual([{ text: "Disable the SSL-VPN.", sources: ["fortinet FG-IR-24-015"] }])
  })

  it("puts vendor and distro advisories before Red Hat VEX and the CNA", () => {
    const detail = {
      advisoryVulnerabilities: [
        adv("red-hat-vex", "CVE-2024-1", "From VEX.", [{ vendor: "red-hat-9", product: "kernel" }]),
        adv("redhat", "RHSA-2024:1", "From the RHSA.", [{ vendor: "red-hat-9", product: "kernel" }]),
      ],
      cnaWorkaround: "From the CNA.",
      cnaProvider: "redhat",
    }
    expect(collectWorkarounds(detail, rhel).map((w) => w.sources[0])).toEqual(["redhat RHSA-2024:1", "Red Hat VEX", "CNA: redhat"])
  })

  it("gives nothing without text, without detail or without an alert", () => {
    const detail = { advisoryVulnerabilities: [adv("red-hat-vex", "CVE-2024-1", "  ", [{ vendor: "red-hat-9", product: "kernel" }])], cnaWorkaround: null }
    expect(collectWorkarounds(detail, rhel)).toEqual([])
    expect(collectWorkarounds(null, rhel)).toEqual([])
    expect(collectWorkarounds({ advisoryVulnerabilities: [], cnaWorkaround: "x", cnaProvider: "acme" }, null)).toEqual([])
  })
})
