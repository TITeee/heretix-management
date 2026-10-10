import { prisma } from "@/lib/db"

export async function getHeretixApiUrl(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "HERETIX_API_URL" } })
  return setting?.value ?? process.env.HERETIX_API_URL ?? "http://localhost:5000"
}

export async function getHeretixApiKey(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "HERETIX_API_KEY" } })
  return setting?.value ?? process.env.HERETIX_API_KEY ?? null
}

async function apiHeaders(): Promise<Record<string, string>> {
  const key = await getHeretixApiKey()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (key) headers["x-api-key"] = key
  return headers
}

export type VulnSearchResult = {
  id: string
  externalId: string
  source: string
  sources: string[]
  severity: string | null
  cvssScore: number | null
  cvssVector: string | null
  summary: string | null
  publishedAt: string | null
  approximateMatch: boolean
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
  fixedVersion: string | null
  /**
   * The distro's own rating of this CVE for the matched package, verbatim
   * (Ubuntu priority, Debian urgency, Red Hat impact); null when the match
   * came from a source without one. Per package match, unlike severity,
   * which is the CVE-wide rating. Optional: older heretix-api omits it.
   */
  distroPriority?: string | null
  /**
   * Why the matched package has no fix (affected / deferred / will_not_fix /
   * out_of_support / under_investigation; the set may grow, and an unknown
   * value means "affected"), and the source's own wording behind it. null
   * when the matching source doesn't track fix status. Optional: older
   * heretix-api omits both.
   */
  fixStatus?: string | null
  fixStatusDetail?: string | null
  /**
   * Every id this finding is reachable by, including externalId. externalId is
   * the *preferred* id and changes when a CVE is assigned to something that only
   * had a vendor or OSV id before; the others stay put, so they are what lets an
   * alert raised under the old id be recognised as the same finding.
   *
   * Optional: an older heretix-api that predates this field simply omits it.
   */
  aliases?: string[]
}

export type BatchPackage = {
  package: string
  version: string
  ecosystem?: string
}

export type BatchResultItem = {
  package: string
  version: string
  ecosystem?: string
  vulnerabilities: VulnSearchResult[]
}

export async function batchSearch(
  packages: BatchPackage[]
): Promise<BatchResultItem[]> {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const res = await fetch(`${baseUrl}/api/v1/vulnerabilities/search/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ packages }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    throw new Error(`heretix-api batch error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.results ?? []
}

export async function searchVulnerabilities(params: {
  package?: string
  version?: string
  ecosystem?: string
  limit?: number
  offset?: number
}) {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const query = new URLSearchParams()
  if (params.package) query.set("package", params.package)
  if (params.version) query.set("version", params.version)
  if (params.ecosystem) query.set("ecosystem", params.ecosystem)
  if (params.limit) query.set("limit", String(params.limit))
  if (params.offset) query.set("offset", String(params.offset))

  const res = await fetch(
    `${baseUrl}/api/v1/vulnerabilities/search?${query}`,
    { headers, signal: AbortSignal.timeout(30_000) }
  )
  if (!res.ok) {
    throw new Error(`heretix-api search error: ${res.status}`)
  }
  return res.json()
}

/** A suggested name and where heretix-api found it, so a name is never an unexplained guess. */
export type PackageSuggestion = {
  name: string
  /** nvd, osv or cna. */
  sources: string[]
  /** CPE / CNA vendors the name is found under; one the typed text matched comes first. */
  vendors: string[]
  /** Ecosystem families of the OSV packages with this name ("Debian", "npm"). */
  ecosystems: string[]
  matchedBy: "name" | "vendor"
}

export async function suggestPackages(params: {
  q: string
  ecosystem?: string
}): Promise<PackageSuggestion[]> {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const query = new URLSearchParams({ q: params.q })
  if (params.ecosystem) query.set("ecosystem", params.ecosystem)

  const res = await fetch(
    `${baseUrl}/api/v1/vulnerabilities/suggest?${query}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) {
    throw new Error(`heretix-api suggest error: ${res.status}`)
  }
  const data = await res.json()
  // A heretix-api that has `details` but not every field of it (it gained
  // `ecosystems` after `vendors`) gets the missing ones as empty lists.
  if (Array.isArray(data.details)) {
    return data.details.map((d: Partial<PackageSuggestion> & { name: string }) => ({
      name: d.name,
      sources: d.sources ?? [],
      vendors: d.vendors ?? [],
      ecosystems: d.ecosystems ?? [],
      matchedBy: d.matchedBy ?? "name",
    }))
  }
  // A heretix-api from before `details` existed returns the names alone.
  return (data.suggestions ?? []).map((name: string) => ({
    name, sources: [], vendors: [], ecosystems: [], matchedBy: "name" as const,
  }))
}

export type CveCpeMatch = {
  cpe: string
  vendor: string
  product: string
}

/**
 * Reverse-resolves a CVE + the product label recorded on the alert (e.g.
 * "PAN-OS") to the CPE vendor:product NVD's own analysts already assigned to
 * that specific CVE. Returns null when heretix-api has no matching CPE data
 * for this CVE/product pair (no NVD analysis yet, or an ambiguous match) —
 * that is an expected, common outcome, not an error.
 */
export async function findCpeForCve(cveId: string, product: string): Promise<CveCpeMatch | null> {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const query = new URLSearchParams({ product })

  const res = await fetch(
    `${baseUrl}/api/v1/vulnerabilities/${encodeURIComponent(cveId)}/cpe?${query}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`heretix-api cpe lookup error: ${res.status}`)
  }
  return res.json()
}

export type CpeSearchResult = {
  cpe: string
  parsed: { vendor: string; product: string; version: string | null }
  results: VulnSearchResult[]
}

export class HeretixApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function searchByCPE(cpe: string): Promise<CpeSearchResult> {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const query = new URLSearchParams({ cpe })
  const res = await fetch(
    `${baseUrl}/api/v1/vulnerabilities/search/cpe?${query}`,
    { headers, signal: AbortSignal.timeout(30_000) }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    const msg = body?.error ?? `heretix-api CPE search error: ${res.status}`
    throw new HeretixApiError(res.status, msg)
  }
  return res.json()
}

export async function getVulnerabilityById(id: string) {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const res = await fetch(
    `${baseUrl}/api/v1/vulnerabilities/${encodeURIComponent(id)}`,
    { headers, signal: AbortSignal.timeout(15_000) }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`heretix-api lookup error: ${res.status}`)
  return res.json()
}

export async function getStats() {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const res = await fetch(`${baseUrl}/api/v1/vulnerabilities/stats`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`heretix-api stats error: ${res.status}`)
  return res.json()
}

/** A product catalog entry as heretix-api lists it: what a picker shows and the exact pairs a search by its name asks. */
export type CatalogListing = {
  name: string
  vendor: string
  product: string
  category: string
  aliases: string[]
  versionHint: string
  /** Where a search by the name looks: nvd, cna. Vendor advisories and OSV are not asked. */
  sources: string[]
  nvd: { vendor: string; products?: string[]; productPrefixes?: string[]; excludePrefixes?: string[] }[]
  cna: { vendors: string[]; products: string[] }[]
}

/** Throws when heretix-api has no catalog (an older version) or cannot be reached. */
export async function listCatalog(params: { q?: string } = {}): Promise<CatalogListing[]> {
  const [baseUrl, headers] = await Promise.all([getHeretixApiUrl(), apiHeaders()])
  const query = new URLSearchParams()
  if (params.q) query.set("q", params.q)

  const res = await fetch(
    `${baseUrl}/api/v1/catalog?${query}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) {
    throw new Error(`heretix-api catalog error: ${res.status}`)
  }
  const data = await res.json()
  if (!Array.isArray(data.entries)) throw new Error("heretix-api catalog error: no entries")
  return data.entries
}
