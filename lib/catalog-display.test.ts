import { describe, it, expect } from "vitest"
import { describeCatalogPairs } from "./catalog-display"
import type { CatalogListing } from "./heretix-api"

function entry(overrides: Partial<CatalogListing>): CatalogListing {
  return {
    name: "X", vendor: "X", product: "X", category: "network", aliases: [], versionHint: "1",
    sources: [], nvd: [], cna: [], ...overrides,
  }
}

describe("describeCatalogPairs", () => {
  it("lists the exact NVD products and the CNA vendor and product, one line each", () => {
    expect(describeCatalogPairs(entry({
      nvd: [{ vendor: "nintex", products: ["automation"] }],
      cna: [{ vendors: ["Nintex"], products: ["Automation"] }],
    }))).toEqual(["NVD  nintex / automation", "CNA  Nintex / Automation"])
  })

  it("shows a product family by its prefix and what it leaves out", () => {
    expect(describeCatalogPairs(entry({
      nvd: [{ vendor: "f5", productPrefixes: ["big-ip"], excludePrefixes: ["big-ip_next"] }],
    }))).toEqual(["NVD  f5 / big-ip* (not big-ip_next*)"])
  })

  it("shows every spelling of a CNA vendor", () => {
    expect(describeCatalogPairs(entry({
      cna: [{ vendors: ["MongoDB", "MongoDB Inc"], products: ["MongoDB Server"] }],
    }))).toEqual(["CNA  MongoDB | MongoDB Inc / MongoDB Server"])
  })

  it("says nothing for an entry that searches nothing", () => {
    expect(describeCatalogPairs(entry({}))).toEqual([])
  })
})
