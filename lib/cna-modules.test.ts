import { describe, it, expect } from "vitest"
import { cnaModules } from "@/lib/cna-modules"

describe("cnaModules", () => {
  it("reads the modules a product is scoped to (F5 BIG-IP CVE-2025-53521)", () => {
    const raw = [{ vendor: "F5", product: "BIG-IP", modules: ["APM"], versions: [], defaultStatus: "unknown" }]
    expect(cnaModules(raw, "f5")).toEqual([{ product: "BIG-IP", modules: ["APM"], all: false }])
  })

  it("matches the CNA name without regard to case", () => {
    const raw = [{ product: "BIG-IP", modules: ["ASM"] }]
    expect(cnaModules(raw, "F5")).toHaveLength(1)
    expect(cnaModules(raw, " f5 ")).toHaveLength(1)
  })

  it("reads every spelling of 'all modules' as all, and keeps nothing else for it", () => {
    for (const name of ["All Modules", "All_Modules", "ALL", "all modules", "All"]) {
      expect(cnaModules([{ product: "BIG-IP", modules: [name] }], "f5")).toEqual([{ product: "BIG-IP", modules: [], all: true }])
    }
  })

  it("keeps a named module beside 'all modules', and merges the same product listed twice", () => {
    const raw = [
      { product: "BIG-IP", modules: ["ASM", "APM"] },
      { product: "BIG-IP", modules: ["APM", "All Modules"] },
    ]
    expect(cnaModules(raw, "f5")).toEqual([{ product: "BIG-IP", modules: ["ASM", "APM"], all: true }])
  })

  it("lists each product that names modules, and leaves out the ones that do not", () => {
    const raw = [
      { product: "BIG-IP", modules: ["ASM"] },
      { product: "BIG-IP Next", versions: [] },
      { product: "NGINX Plus", modules: ["ngx_http_mp4_module"] },
    ]
    expect(cnaModules(raw, "f5").map((p) => p.product)).toEqual(["BIG-IP", "NGINX Plus"])
  })

  it("ignores the modules of a CNA that uses the field for something else (VulDB writes the feature, EEF the Elixir module)", () => {
    expect(cnaModules([{ product: "laravel-crm", modules: ["TinyMCE Media Upload"] }], "VulDB")).toEqual([])
    expect(cnaModules([{ product: "decimal", modules: ["'Elixir.Decimal'"] }], "EEF")).toEqual([])
    expect(cnaModules([{ product: "pgAdmin 4", modules: ["Backup"] }], "PostgreSQL")).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: ["ASM"] }], null)).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: ["ASM"] }], undefined)).toEqual([])
  })

  it("returns nothing for a record without usable modules", () => {
    expect(cnaModules(null, "f5")).toEqual([])
    expect(cnaModules("x", "f5")).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: [] }, { product: "", modules: ["ASM"] }, { modules: ["ASM"] }, null, 3], "f5")).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: [1, "", "  "] }], "f5")).toEqual([])
  })
})
