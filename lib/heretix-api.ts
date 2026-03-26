import { prisma } from "@/lib/db"

export async function getHeretixApiUrl(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "HERETIX_API_URL" } })
  return setting?.value ?? process.env.HERETIX_API_URL ?? "http://localhost:3001"
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
