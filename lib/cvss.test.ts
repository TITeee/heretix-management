import { describe, it, expect } from "vitest"
import { detectCvssVersion, cvssVersionLabel, parseCvssVector, GROUP_ORDER } from "./cvss"

describe("detectCvssVersion", () => {
  it("treats an unprefixed vector as 2.0", () => {
    expect(detectCvssVersion("AV:N/AC:L/Au:N/C:C/I:C/A:C")).toBe("2.0")
  })

  it("detects 3.0 and 3.1 vectors as 3.x", () => {
    expect(detectCvssVersion("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe("3.x")
    expect(detectCvssVersion("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe("3.x")
  })

  it("detects 4.0 vectors", () => {
    expect(detectCvssVersion("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBe("4.0")
  })
})

describe("cvssVersionLabel", () => {
  it("returns '2.0' for an unprefixed vector", () => {
    expect(cvssVersionLabel("AV:N/AC:L/Au:N/C:C/I:C/A:C")).toBe("2.0")
  })

  it("returns the verbatim prefix for a versioned vector", () => {
    expect(cvssVersionLabel("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe("3.1")
    expect(cvssVersionLabel("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBe("4.0")
  })
})

describe("parseCvssVector", () => {
  it("parses a 2.0 vector with version-specific labels", () => {
    const metrics = parseCvssVector("AV:N/AC:L/Au:N/C:C/I:C/A:C")
    expect(metrics).toEqual([
      { key: "AV", label: "Access Vector", value: "N", valueLabel: "Network", group: "Base" },
      { key: "AC", label: "Access Complexity", value: "L", valueLabel: "Low", group: "Base" },
      { key: "Au", label: "Authentication", value: "N", valueLabel: "None", group: "Base" },
      { key: "C", label: "Confidentiality Impact", value: "C", valueLabel: "Complete", group: "Base" },
      { key: "I", label: "Integrity Impact", value: "C", valueLabel: "Complete", group: "Base" },
      { key: "A", label: "Availability Impact", value: "C", valueLabel: "Complete", group: "Base" },
    ])
  })

  it("strips the CVSS: prefix segment from the metric list", () => {
    const metrics = parseCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
    expect(metrics.map((m) => m.key)).toEqual(["AV", "AC", "PR", "UI", "S", "C", "I", "A"])
  })

  it("resolves 3.x environmental metrics, including the shared 'Not Defined' default", () => {
    const metrics = parseCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:X/MS:C")
    const cr = metrics.find((m) => m.key === "CR")
    expect(cr).toEqual({ key: "CR", label: "Confidentiality Requirement", value: "X", valueLabel: "Not Defined", group: "Environmental" })
    const ms = metrics.find((m) => m.key === "MS")
    expect(ms).toEqual({ key: "MS", label: "Modified Scope", value: "C", valueLabel: "Changed", group: "Environmental" })
  })

  it("resolves 4.0 Threat and Supplemental groups, including the Safety-augmented MSI value set", () => {
    const metrics = parseCvssVector(
      "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N/E:A/S:P/MSI:S",
    )
    expect(metrics.find((m) => m.key === "E")).toEqual({
      key: "E", label: "Exploit Maturity", value: "A", valueLabel: "Attacked", group: "Threat",
    })
    expect(metrics.find((m) => m.key === "S")).toEqual({
      key: "S", label: "Safety", value: "P", valueLabel: "Present", group: "Supplemental",
    })
    expect(metrics.find((m) => m.key === "MSI")).toEqual({
      key: "MSI", label: "Modified Integrity (Subsequent System)", value: "S", valueLabel: "Safety", group: "Environmental",
    })
  })

  it("keeps an unrecognized metric with its raw key/value, defaulted to the Base group", () => {
    const metrics = parseCvssVector("CVSS:3.1/AV:N/ZZ:Q")
    expect(metrics.find((m) => m.key === "ZZ")).toEqual({
      key: "ZZ", label: "ZZ", value: "Q", valueLabel: "Q", group: "Base",
    })
  })

  it("skips segments without a ':' separator", () => {
    const metrics = parseCvssVector("CVSS:3.1/AV:N/garbage/AC:L")
    expect(metrics.map((m) => m.key)).toEqual(["AV", "AC"])
  })

  it("skips segments with an empty key or empty value", () => {
    const metrics = parseCvssVector("AV:N/:X/AC:")
    expect(metrics.map((m) => m.key)).toEqual(["AV"])
  })

  it("keeps only the first occurrence when a metric key repeats", () => {
    const metrics = parseCvssVector("CVSS:3.1/AV:N/AC:L/AV:L")
    expect(metrics.map((m) => m.key)).toEqual(["AV", "AC"])
    expect(metrics.find((m) => m.key === "AV")?.value).toBe("N")
  })

  it("treats keys that differ only by case as distinct metrics", () => {
    // 2.0's 'Au' (Authentication) vs. 4.0's 'AU' (Automatable, unused here) must
    // not collide with each other via a case-insensitive dedup.
    const metrics = parseCvssVector("Au:N/AU:Y")
    expect(metrics.map((m) => m.key)).toEqual(["Au", "AU"])
  })

  it("returns an empty list for an empty vector", () => {
    expect(parseCvssVector("")).toEqual([])
  })
})

describe("GROUP_ORDER", () => {
  it("lists groups from Base to Supplemental", () => {
    expect(GROUP_ORDER).toEqual(["Base", "Threat", "Temporal", "Environmental", "Supplemental"])
  })
})
