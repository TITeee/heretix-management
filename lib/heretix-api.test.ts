import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { setting: { findUnique: vi.fn().mockResolvedValue(null) } },
}))

import { listCatalog, suggestPackages } from "./heretix-api"

function respondWith(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("suggestPackages", () => {
  it("returns heretix-api's details as they are, with where each name was found", async () => {
    const details = [
      { name: "connect_secure", sources: ["nvd"], vendors: ["ivanti"], ecosystems: [], matchedBy: "vendor" },
      { name: "BR-6208AC", sources: ["cna"], vendors: ["brother"], ecosystems: [], matchedBy: "name" },
    ]
    respondWith({ suggestions: details.map((d) => d.name), details })
    expect(await suggestPackages({ q: "ivanti" })).toEqual(details)
  })

  it("makes the same shape out of a heretix-api that returns the names alone", async () => {
    respondWith({ suggestions: ["lodash", "lodash-es"] })
    expect(await suggestPackages({ q: "lodash" })).toEqual([
      { name: "lodash", sources: [], vendors: [], ecosystems: [], matchedBy: "name" },
      { name: "lodash-es", sources: [], vendors: [], ecosystems: [], matchedBy: "name" },
    ])
  })

  it("fills in the fields an older heretix-api left out of details", async () => {
    respondWith({ suggestions: ["curl"], details: [{ name: "curl", sources: ["osv"], vendors: ["haxx"], matchedBy: "name" }] })
    expect(await suggestPackages({ q: "curl" })).toEqual([
      { name: "curl", sources: ["osv"], vendors: ["haxx"], ecosystems: [], matchedBy: "name" },
    ])
  })

  it("passes the typed text and the ecosystem on", async () => {
    respondWith({ suggestions: [] })
    await suggestPackages({ q: "connect secure", ecosystem: "Debian" })
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(url).toContain("/api/v1/vulnerabilities/suggest?")
    expect(new URL(url).searchParams.get("q")).toBe("connect secure")
    expect(new URL(url).searchParams.get("ecosystem")).toBe("Debian")
  })

  it("throws when heretix-api answers with an error, for the route to swallow", async () => {
    respondWith({}, false)
    await expect(suggestPackages({ q: "x" })).rejects.toThrow("heretix-api suggest error: 500")
  })
})

describe("listCatalog", () => {
  const entry = {
    name: "Ivanti Automation", vendor: "Ivanti", product: "Automation", category: "application",
    aliases: [], versionHint: "2024.4", sources: ["nvd"],
    nvd: [{ vendor: "ivanti", products: ["automation"] }], cna: [],
  }

  it("returns the entries heretix-api lists, passing the typed text on", async () => {
    respondWith({ total: 1, entries: [entry] })
    expect(await listCatalog({ q: "ivanti" })).toEqual([entry])
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(url).toContain("/api/v1/catalog?")
    expect(new URL(url).searchParams.get("q")).toBe("ivanti")
  })

  it("asks for the whole catalog when nothing was typed", async () => {
    respondWith({ total: 0, entries: [] })
    await listCatalog()
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(new URL(url).searchParams.has("q")).toBe(false)
  })

  it("throws for a heretix-api without a catalog, which the route turns into 'not available'", async () => {
    respondWith({}, false)
    await expect(listCatalog()).rejects.toThrow("heretix-api catalog error: 500")
    respondWith({ error: "not found" })
    await expect(listCatalog()).rejects.toThrow("no entries")
  })
})
