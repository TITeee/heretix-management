import { describe, it, expect } from "vitest"
import { cnaModules } from "@/lib/cna-modules"

describe("cnaModules", () => {
  it("reads the modules a product is scoped to (F5 BIG-IP CVE-2025-53521)", () => {
    const raw = [{ vendor: "F5", product: "BIG-IP", modules: ["APM"], versions: [], defaultStatus: "unknown" }]
    expect(cnaModules(raw)).toEqual([{ product: "BIG-IP", modules: ["APM"], all: false }])
  })

  it("reads every spelling of 'all modules' as all, and keeps nothing else for it", () => {
    for (const name of ["All Modules", "All_Modules", "ALL", "all modules", "All"]) {
      expect(cnaModules([{ product: "BIG-IP", modules: [name] }])).toEqual([{ product: "BIG-IP", modules: [], all: true }])
    }
  })

  it("keeps a named module beside 'all modules', and merges the same product listed twice", () => {
    const raw = [
      { product: "BIG-IP", modules: ["ASM", "APM"] },
      { product: "BIG-IP", modules: ["APM", "All Modules"] },
    ]
    expect(cnaModules(raw)).toEqual([{ product: "BIG-IP", modules: ["ASM", "APM"], all: true }])
  })

  it("lists each product that names modules, and leaves out the ones that do not", () => {
    const raw = [
      { product: "BIG-IP", modules: ["ASM"] },
      { product: "BIG-IP Next", versions: [] },
      { product: "NGINX Plus", modules: ["ngx_http_mp4_module"] },
    ]
    expect(cnaModules(raw).map((p) => p.product)).toEqual(["BIG-IP", "NGINX Plus"])
  })

  it("returns nothing for a record without usable modules", () => {
    expect(cnaModules(null)).toEqual([])
    expect(cnaModules("x")).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: [] }, { product: "", modules: ["ASM"] }, { modules: ["ASM"] }, null, 3])).toEqual([])
    expect(cnaModules([{ product: "BIG-IP", modules: [1, "", "  "] }])).toEqual([])
  })
})
