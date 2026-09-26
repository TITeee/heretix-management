import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { batchSearch } from "@/lib/heretix-api"
import { generateApiToken, hashApiToken } from "@/lib/api-token"
import { GET, POST } from "./route"
import { POST as SCAN } from "./[id]/scan/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))
vi.mock("@/lib/heretix-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/heretix-api")>("@/lib/heretix-api")
  return { ...actual, batchSearch: vi.fn().mockResolvedValue([]), searchByCPE: vi.fn().mockResolvedValue({ results: [] }) }
})
vi.mock("@/lib/slack", () => ({ notifySlackIfNeeded: vi.fn().mockResolvedValue(undefined) }))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockedBatchSearch = batchSearch as unknown as ReturnType<typeof vi.fn>

const DAY = 24 * 60 * 60 * 1000

async function createToken(opts: { scopes: string[]; expiresAt?: Date; revokedAt?: Date; name?: string }) {
  const token = generateApiToken()
  await prisma.apiToken.create({
    data: {
      name: opts.name ?? "ci",
      tokenHash: hashApiToken(token),
      prefix: token.slice(0, 8),
      scopes: opts.scopes,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * DAY),
      revokedAt: opts.revokedAt ?? null,
    },
  })
  return token
}

// A raw CycloneDX SBOM as the whole body, the way CI posts one.
const sbom = {
  bomFormat: "CycloneDX",
  metadata: { component: { "bom-ref": "root", type: "container", name: "myapp:1.0" } },
  components: [{ "bom-ref": "l", type: "library", name: "lodash", version: "4.17.20", purl: "pkg:npm/lodash@4.17.20" }],
}

function importRequest(token: string | null, query = "", body: unknown = sbom) {
  return new NextRequest(`http://localhost/api/assets${query}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })
}

describe("API token authentication", () => {
  beforeEach(async () => {
    await resetDb()
    mockedBatchSearch.mockReset().mockResolvedValue([])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("imports a raw SBOM with an import-scoped token, honoring ?hostname=, and audits it as the token", async () => {
    const token = await createToken({ scopes: ["import"] })
    const res = await POST(importRequest(token, "?hostname=myapp"))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ hostname: "myapp" })

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "asset_imported" } })
    expect(log).toMatchObject({ userId: null, userEmail: "api-token:ci" })
    const row = await prisma.apiToken.findFirstOrThrow()
    expect(row.lastUsedAt).not.toBeNull()
  })

  it.each([
    ["an unknown token", async () => generateApiToken()],
    ["a malformed token", async () => "not-a-heretix-token"],
    ["a revoked token", async () => createToken({ scopes: ["import"], revokedAt: new Date() })],
    ["an expired token", async () => createToken({ scopes: ["import"], expiresAt: new Date(Date.now() - DAY) })],
  ])("rejects %s with 401 — even though a session cookie would have been valid", async (_label, makeToken) => {
    const res = await POST(importRequest(await makeToken()))
    expect(res.status).toBe(401)
    expect(await prisma.asset.count()).toBe(0)
  })

  it("rejects ?scan=true without the scan scope, before importing anything", async () => {
    const token = await createToken({ scopes: ["import"] })
    const res = await POST(importRequest(token, "?scan=true"))
    expect(res.status).toBe(403)
    expect(await prisma.asset.count()).toBe(0)
  })

  it("imports and scans in one request with both scopes", async () => {
    const token = await createToken({ scopes: ["import", "scan"] })
    const res = await POST(importRequest(token, "?scan=true&hostname=myapp"))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ hostname: "myapp", scan: { newAlerts: 0, resolvedAlerts: 0 } })
    expect(mockedBatchSearch).toHaveBeenCalled()
  })

  it("answers 502 when the scan fails, with the import already committed", async () => {
    mockedBatchSearch.mockRejectedValue(new Error("heretix-api unreachable"))
    const token = await createToken({ scopes: ["import", "scan"] })
    const res = await POST(importRequest(token, "?scan=true"))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain("Imported, but the scan failed")
    expect(await prisma.asset.count()).toBe(1)
  })

  it("does not let an import token create an empty asset by hand", async () => {
    const token = await createToken({ scopes: ["import"] })
    const res = await POST(importRequest(token, "", { hostname: "manual-host" }))
    expect(res.status).toBe(400)
    expect(await prisma.asset.count()).toBe(0)
  })

  it("scans an asset with a scan-scoped token, and refuses an import-only one", async () => {
    const asset = await prisma.asset.create({ data: { name: "h", hostname: "h", osId: "x", osVersionId: "x", osName: "x" } })
    const scanRequest = (token: string) =>
      new NextRequest(`http://localhost/api/assets/${asset.id}/scan`, { method: "POST", headers: { authorization: `Bearer ${token}` } })
    const params = { params: Promise.resolve({ id: asset.id }) }

    expect((await SCAN(scanRequest(await createToken({ scopes: ["import"], name: "a" })), params)).status).toBe(403)
    expect((await SCAN(scanRequest(await createToken({ scopes: ["scan"], name: "b" })), params)).status).toBe(200)
  })

  it("is ignored by routes that don't accept tokens", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const token = await createToken({ scopes: ["import", "scan"] })
    const res = await GET(new NextRequest("http://localhost/api/assets", { headers: { authorization: `Bearer ${token}` } }))
    expect(res.status).toBe(401)
  })
})
