import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { GET, POST } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/assets${query ? `?${query}` : ""}`)
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assets", { method: "POST", body: JSON.stringify(body) })
}

describe("GET /api/assets", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })

  it("filters by name or hostname, case-insensitively", async () => {
    await prisma.asset.create({ data: { name: "Web Server", hostname: "web-01", osId: "u", osVersionId: "1", osName: "u" } })
    await prisma.asset.create({ data: { name: "DB Server", hostname: "db-01", osId: "u", osVersionId: "1", osName: "u" } })

    const res = await GET(getRequest("search=web"))
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].hostname).toBe("web-01")
  })

  it("respects the limit param", async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.asset.create({ data: { name: `h${i}`, hostname: `h${i}`, osId: "u", osVersionId: "1", osName: "u" } })
    }
    const res = await GET(getRequest("limit=2"))
    expect(await res.json()).toHaveLength(2)
  })
})

describe("POST /api/assets — manual creation", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("creates a manual asset and records an audit log entry", async () => {
    const res = await POST(postRequest({ hostname: "manual-1", name: "Manual Box" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.hostname).toBe("manual-1")
    expect(body.assetType).toBe("host")

    const logs = await prisma.auditLog.findMany({ where: { action: "asset_created" } })
    expect(logs).toHaveLength(1)
    expect(logs[0].userEmail).toBe("test@example.com")
  })

  it("requires a hostname", async () => {
    const res = await POST(postRequest({ name: "No Hostname" }))
    expect(res.status).toBe(400)
  })

  it("rejects a duplicate hostname", async () => {
    await prisma.asset.create({ data: { name: "x", hostname: "dup-1", osId: "u", osVersionId: "1", osName: "u" } })
    const res = await POST(postRequest({ hostname: "dup-1" }))
    expect(res.status).toBe(409)
  })
})

describe("POST /api/assets — CycloneDX import", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("parses packages from a CycloneDX BOM: scoped npm, an OS package via its distro qualifier, filters non-package components and duplicates, and resolves direct/transitive deps", async () => {
    const bom = {
      bomFormat: "CycloneDX",
      metadata: {
        component: { "bom-ref": "root", name: "cdx-host", version: "1.0", type: "application" },
        timestamp: "2026-01-01T00:00:00Z",
        tools: [{ name: "syft", version: "1.0.0" }],
      },
      components: [
        { "bom-ref": "pkg:npm/lodash@4.17.21", type: "library", name: "lodash", version: "4.17.21", purl: "pkg:npm/lodash@4.17.21" },
        { "bom-ref": "pkg:npm/%40babel/core@7.20.0", type: "library", name: "core", version: "7.20.0", purl: "pkg:npm/%40babel/core@7.20.0" },
        { "bom-ref": "pkg:apk/alpine/curl@8.0.0?distro=alpine-3.18", type: "library", name: "curl", version: "8.0.0", purl: "pkg:apk/alpine/curl@8.0.0?distro=alpine-3.18" },
        { "bom-ref": "file-1", type: "file", name: "some-file" },
        { "bom-ref": "no-purl-no-version", type: "library", name: "mystery" },
        { "bom-ref": "dup-ref", type: "library", name: "lodash-dup", version: "4.17.21", purl: "pkg:npm/lodash@4.17.21" },
      ],
      dependencies: [
        { ref: "root", dependsOn: ["pkg:npm/lodash@4.17.21"] },
        { ref: "pkg:npm/lodash@4.17.21", dependsOn: ["pkg:npm/%40babel/core@7.20.0"] },
      ],
    }

    const res = await POST(postRequest(bom))
    expect(res.status).toBe(201)
    const asset = await res.json()
    expect(asset.sbomTool).toBe("syft 1.0.0")

    const packages = await prisma.package.findMany({ where: { assetId: asset.id } })
    // "file" (non-package type), "mystery" (no purl/version), and the duplicate
    // lodash purl are all excluded — only 3 distinct packages should land.
    expect(packages).toHaveLength(3)

    const lodash = packages.find((p) => p.name === "lodash")!
    expect(lodash).toMatchObject({ version: "4.17.21", ecosystem: "npm", direct: true })
    expect(lodash.deps).toEqual(["pkg:npm/%40babel/core@7.20.0"])

    const babel = packages.find((p) => p.name === "@babel/core")!
    expect(babel).toMatchObject({ version: "7.20.0", ecosystem: "npm", direct: false })

    const curl = packages.find((p) => p.name === "curl")!
    expect(curl).toMatchObject({ version: "8.0.0", ecosystem: "Alpine:v3.18" })
  })
})

describe("POST /api/assets — re-import diff", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("diffs a re-import against the existing asset: upgrades carry their open alerts forward, plain removals do not, and package history records both", async () => {
    const first = await POST(postRequest({
      inventory: {
        hostname: "host-2",
        packages: [
          { name: "lodash", version: "4.17.21", rawVersion: "4.17.21", ecosystem: "npm", source: "sbom" },
          { name: "curl", version: "8.0.0", rawVersion: "8.0.0", ecosystem: "Alpine:v3.18", source: "sbom" },
        ],
      },
    }))
    expect(first.status).toBe(201)
    const asset = await first.json()

    const alert = await prisma.alert.create({
      data: {
        assetId: asset.id, packageName: "lodash", packageVersion: "4.17.21", ecosystem: "npm",
        externalId: "CVE-2026-1111", sources: ["osv"], status: "open",
      },
    })

    const second = await POST(postRequest({
      inventory: {
        hostname: "host-2",
        packages: [
          { name: "lodash", version: "4.17.22", rawVersion: "4.17.22", ecosystem: "npm", source: "sbom" },
        ],
      },
    }))
    expect(second.status).toBe(200)
    const body = await second.json()
    expect(body.updated).toBe(true)

    const carriedAlert = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(carriedAlert.packageVersion).toBe("4.17.22")

    const alertEvents = await prisma.alertEvent.findMany({ where: { alertId: alert.id } })
    expect(alertEvents.map((e) => e.type)).toEqual(["package_changed"])

    const remainingPackages = await prisma.package.findMany({ where: { assetId: asset.id } })
    expect(remainingPackages).toHaveLength(1)
    expect(remainingPackages[0]).toMatchObject({ name: "lodash", version: "4.17.22" })

    const history = await prisma.packageHistory.findMany({ where: { assetId: asset.id } })
    expect(history).toHaveLength(3)
    expect(history.filter((h) => h.action === "removed").map((h) => h.packageName).sort()).toEqual(["curl", "lodash"])
    expect(history.filter((h) => h.action === "added").map((h) => h.packageName)).toEqual(["lodash"])
  })
})
