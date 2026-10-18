import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { setting: { findUnique: vi.fn().mockResolvedValue(null) } },
}))

import { batchSearch, getVulnerabilityById, listCatalog, searchAllVulnerabilities, suggestPackages, SEARCH_MAX_RESULTS } from "./heretix-api"

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

describe("batchSearch", () => {
  const pkgs = [{ package: "lodash", version: "4.17.20" }]
  const ok = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [{ package: "lodash", version: "4.17.20", vulnerabilities: [] }] }) }
  const busy = (retryAfter: string | null) => ({ ok: false, status: 429, headers: { get: () => retryAfter }, text: async () => "busy" })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("waits the Retry-After heretix-api gives and asks again", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(busy("5")).mockResolvedValueOnce(ok)
    vi.stubGlobal("fetch", fetchMock)

    const result = batchSearch(pkgs)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("waits 5 s when there is no usable Retry-After, and never more than 30 s", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(busy(null)).mockResolvedValueOnce(busy("600")).mockResolvedValueOnce(ok)
    vi.stubGlobal("fetch", fetchMock)

    const result = batchSearch(pkgs)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toHaveLength(1)
  })

  it("gives up with the 429 after five retries", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(busy("1"))
    vi.stubGlobal("fetch", fetchMock)

    const result = batchSearch(pkgs)
    const failed = expect(result).rejects.toThrow("heretix-api batch error: 429")
    await vi.advanceTimersByTimeAsync(10_000)
    await failed
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("does not retry another error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, text: async () => "boom" })
    vi.stubGlobal("fetch", fetchMock)
    await expect(batchSearch(pkgs)).rejects.toThrow("heretix-api batch error: 500 boom")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("searchAllVulnerabilities", () => {
  // Serves `total` results the way heretix-api pages them (limit/offset).
  function serve(total: number) {
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams
      const limit = Number(q.get("limit")), offset = Number(q.get("offset") ?? 0)
      const n = Math.max(0, Math.min(limit, total - offset))
      return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, (_, i) => ({ id: `v${offset + i}` })) }) }
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("asks once when the first page is not full", async () => {
    const fetchMock = serve(3)
    expect(await searchAllVulnerabilities({ package: "lodash" })).toMatchObject({ truncated: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("collects every page past the 500 a single request returns", async () => {
    // Windows Server 2022 one month behind: 977 findings.
    const fetchMock = serve(977)
    const { results, truncated } = await searchAllVulnerabilities({ package: "Windows Server 2022", version: "10.0.20348.5622", ecosystem: "advisory" })
    expect(results).toHaveLength(977)
    expect(new Set(results.map(r => (r as { id: string }).id)).size).toBe(977)
    expect(truncated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=500")
  })

  it("stops at the maximum and says whether more were left out", async () => {
    // Windows Server 2022 never updated: 5,157 findings.
    serve(5_157)
    const over = await searchAllVulnerabilities({ package: "Windows Server 2022", ecosystem: "advisory" })
    expect(over.results).toHaveLength(SEARCH_MAX_RESULTS)
    expect(over.truncated).toBe(true)

    serve(SEARCH_MAX_RESULTS)
    const exact = await searchAllVulnerabilities({ package: "x" })
    expect(exact.results).toHaveLength(SEARCH_MAX_RESULTS)
    expect(exact.truncated).toBe(false)
  })
})

describe("getVulnerabilityById", () => {
  const rateLimited = (retryAfter: string | null) => ({
    ok: false,
    status: 429,
    headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) },
    text: async () => "",
  })
  const found = { ok: true, status: 200, json: async () => ({ cveId: "CVE-2024-0001" }) }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("fails on a 429 for an interactive lookup, which must not wait", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rateLimited("30")))
    await expect(getVulnerabilityById("CVE-2024-0001")).rejects.toThrow("lookup error: 429")
  })

  it("waits out a 429 and asks again when told to", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited("40")).mockResolvedValueOnce(found)
    vi.stubGlobal("fetch", fetchMock)
    const result = getVulnerabilityById("CVE-2024-0001", { waitOnRateLimit: true })
    await vi.advanceTimersByTimeAsync(39_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await result).toEqual({ cveId: "CVE-2024-0001" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("waits at most a minute, even for a longer Retry-After", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited("600")).mockResolvedValueOnce(found)
    vi.stubGlobal("fetch", fetchMock)
    const result = getVulnerabilityById("CVE-2024-0001", { waitOnRateLimit: true })
    await vi.advanceTimersByTimeAsync(60_000)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("gives up after ten retries and reports the 429", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(rateLimited("1"))
    vi.stubGlobal("fetch", fetchMock)
    const result = getVulnerabilityById("CVE-2024-0001", { waitOnRateLimit: true })
    const settled = result.catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await settled).toEqual(expect.objectContaining({ message: "heretix-api lookup error: 429" }))
    expect(fetchMock).toHaveBeenCalledTimes(11)
  })

  it("returns null for a vulnerability heretix-api does not know", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await getVulnerabilityById("CVE-2024-0001", { waitOnRateLimit: true })).toBeNull()
  })
})
