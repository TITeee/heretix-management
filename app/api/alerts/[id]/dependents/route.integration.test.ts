import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { buildPURL } from "@/lib/purl"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function get(id: string) {
  return GET(new NextRequest("http://localhost/api/alerts/a1/dependents"), { params: Promise.resolve({ id }) })
}

describe("GET /api/alerts/[id]/dependents", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // Regression test: buildPURL didn't recognize "Rocky Linux:N" / "Oracle
  // Linux:N" — the vulnerable alert's PURL and its would-be parent's PURL
  // both fell through to the same pkg:generic/<name>@<version> shape and
  // happened to still "work" only because they matched each other by
  // accident, never because the join was actually keyed on distro+arch the
  // way it should be. Pin the real OS-package PURL is produced end to end.
  it.each([
    ["Rocky Linux:9", "pkg:rpm/rocky/openssl-libs@1:3.0.7-24.el9"],
    ["Oracle Linux:9", "pkg:rpm/oraclelinux/openssl-libs@1:3.0.7-24.el9"],
  ])("finds a direct dependent for a %s OS package via its resolved PURL", async (ecosystem, purl) => {
    const asset = await prisma.asset.create({
      data: { name: "host-1", hostname: "host-1", osId: "rocky", osVersionId: "9", osName: "Rocky Linux 9" },
    })
    await prisma.package.create({
      data: { assetId: asset.id, name: "openssl-libs", version: "1:3.0.7-24.el9", rawVersion: "1:3.0.7-24.el9", ecosystem, source: "rpm", direct: null, deps: [] },
    })
    await prisma.package.create({
      data: { assetId: asset.id, name: "httpd", version: "2.4.57-2.el9", rawVersion: "2.4.57-2.el9", ecosystem, source: "rpm", direct: true, deps: [purl] },
    })
    const alert = await prisma.alert.create({
      data: {
        assetId: asset.id, packageName: "openssl-libs", packageVersion: "1:3.0.7-24.el9", ecosystem,
        externalId: "CVE-2026-1111", sources: ["osv"], status: "open",
      },
    })

    const res = await get(alert.id)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.hasDepsData).toBe(true)
    expect(data.dependents).toBe(1)
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]).toMatchObject({ name: "httpd", version: "2.4.57-2.el9", direct: true, path: ["httpd", "openssl-libs"] })
  })

  it("gives what the tab links with: the asset, its Services tab, the services that load the package", async () => {
    const asset = await prisma.asset.create({
      data: { name: "host-2", hostname: "host-2", osId: "rhel", osVersionId: "9", osName: "RHEL 9" },
    })
    const ecosystem = "Red Hat:9"
    await prisma.package.create({
      data: {
        assetId: asset.id, name: "openssl-libs", version: "1:3.5.5-6.el9", rawVersion: "1:3.5.5-6.el9", ecosystem, source: "rpm",
        sourcePackage: "openssl", inUse: true, usedBy: ["sshd.service", "postgresql.service"], deps: [],
      },
    })
    await prisma.package.create({
      data: {
        assetId: asset.id, name: "openssh-server", version: "9.9p1-12.el9", rawVersion: "9.9p1-12.el9", ecosystem, source: "rpm",
        sourcePackage: "openssh", direct: true, inUse: true, usedBy: ["sshd.service"], deps: [buildPURL("openssl-libs", "1:3.5.5-6.el9", ecosystem)],
      },
    })
    const alert = await prisma.alert.create({
      data: { assetId: asset.id, packageName: "openssl-libs", packageVersion: "1:3.5.5-6.el9", ecosystem, externalId: "CVE-2026-3333", sources: ["red-hat"], status: "open" },
    })
    await prisma.alert.create({
      data: { assetId: asset.id, packageName: "openssh-server", packageVersion: "9.9p1-12.el9", ecosystem, externalId: "CVE-2026-4444", sources: ["red-hat"], status: "open" },
    })

    const data = await (await get(alert.id)).json()
    expect(data).toMatchObject({ assetId: asset.id, hasRuntimeFacts: true, loadedBy: 2, dependents: 1 })
    expect(data.target).toMatchObject({ name: "openssl-libs", sourcePackage: "openssl", graphId: "src:openssl" })
    expect(data.entries[0]).toMatchObject({ key: "src:openssh", name: "openssh", running: true, services: ["sshd.service"], direct: true, vulnerable: true })
  })

  it("reports no deps data when nothing on the asset has any", async () => {
    const asset = await prisma.asset.create({
      data: { name: "host-1", hostname: "host-1", osId: "x", osVersionId: "x", osName: "x" },
    })
    await prisma.package.create({
      data: { assetId: asset.id, name: "lodash", version: "4.17.20", rawVersion: "4.17.20", ecosystem: "npm", source: "sbom", deps: [] },
    })
    const alert = await prisma.alert.create({
      data: { assetId: asset.id, packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm", externalId: "CVE-2026-2222", sources: ["osv"], status: "open" },
    })

    const data = await (await get(alert.id)).json()
    expect(data).toMatchObject({ hasDepsData: false, entries: [] })
  })

  it("returns 404 for a missing alert", async () => {
    expect((await get("missing-id")).status).toBe(404)
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    expect((await get("missing-id")).status).toBe(401)
  })
})
