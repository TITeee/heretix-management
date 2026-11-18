import { describe, expect, it } from "vitest"
import { lookupSources } from "./lookup-sources"

describe("lookupSources", () => {
  it("names the advisory source of a CVE that only a vendor advisory knows", () => {
    expect(lookupSources({
      nvdVulnerability: null,
      osvVulnerabilities: [],
      advisoryVulnerabilities: [{ source: "advisory-nginx" }],
      cnaVulnerability: null,
    })).toEqual(["advisory-nginx"])
  })

  it("lists NVD, OSV, each advisory source once and the CNA record, in that order", () => {
    expect(lookupSources({
      nvdVulnerability: { id: "n" },
      osvVulnerabilities: [{ id: "o1" }, { id: "o2" }],
      advisoryVulnerabilities: [{ source: "advisory-nginx" }, { source: "red-hat" }, { source: "advisory-nginx" }],
      cnaVulnerability: { id: "c" },
    })).toEqual(["nvd", "osv", "advisory-nginx", "red-hat", "cna"])
  })

  it("is empty for a record with no source rows, and ignores an advisory with no source", () => {
    expect(lookupSources({})).toEqual([])
    expect(lookupSources({ advisoryVulnerabilities: [{ source: null }, {}] })).toEqual([])
  })
})
