import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { findCpeForCve } from "@/lib/heretix-api"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))
vi.mock("@/lib/heretix-api", () => ({ findCpeForCve: vi.fn().mockResolvedValue(null) }))

const mockedFindCpe = findCpeForCve as unknown as ReturnType<typeof vi.fn>

function exportRequest(query = "") {
  return new NextRequest(`http://localhost/api/vex${query ? `?${query}` : ""}`)
}

async function createIgnoredAlert(overrides: Partial<{
  packageName: string; packageVersion: string; ecosystem: string
}> = {}) {
  const asset = await prisma.asset.create({
    data: { name: "host-1", hostname: "host-1", osId: "rocky", osVersionId: "9", osName: "Rocky Linux 9" },
  })
  return prisma.alert.create({
    data: {
      assetId: asset.id,
      packageName: "openssl-libs",
      packageVersion: "1:3.0.7-24.el9",
      ecosystem: "Rocky Linux:9",
      externalId: "CVE-2026-1111",
      sources: ["osv"],
      status: "ignored",
      ignoreReason: "not_affected",
      vexJustification: "code_not_present",
      ...overrides,
    },
  })
}

describe("GET /api/vex", () => {
  beforeEach(async () => {
    await resetDb()
    mockedFindCpe.mockClear().mockResolvedValue(null)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // Regression test: buildPURL didn't recognize "Rocky Linux:N" / "Oracle
  // Linux:N" (only the legacy, pre-2026-09-01 "Rocky:N" / bare
  // "oracle-linux"), so every current Rocky/Oracle Linux package fell
  // through to pkg:generic — unresolvable by a consumer like `trivy --vex`,
  // and wrongly routed through the appliance CPE-lookup fallback below.
  it.each([
    ["Rocky Linux:9", "pkg:rpm/rocky/openssl-libs@1:3.0.7-24.el9"],
    ["Oracle Linux:9", "pkg:rpm/oraclelinux/openssl-libs@1:3.0.7-24.el9"],
  ])("exports a proper OS-package PURL for %s, not pkg:generic", async (ecosystem, expectedPurl) => {
    await createIgnoredAlert({ ecosystem })
    const res = await GET(exportRequest())
    expect(res.status).toBe(200)
    const vex = await res.json()

    expect(vex.components).toHaveLength(1)
    expect(vex.components[0]).toMatchObject({ purl: expectedPurl, type: "operating-system" })
    expect(vex.vulnerabilities[0].affects[0].ref).toBe(expectedPurl)
    // The CPE-recovery path is for real pkg:generic components (vendor
    // appliances) only; a resolvable OS package must not trigger it.
    expect(mockedFindCpe).not.toHaveBeenCalled()
  })

  it("still recovers a CPE for a genuinely generic package (e.g. a vendor appliance)", async () => {
    await createIgnoredAlert({ packageName: "PAN-OS", packageVersion: "11.0.0", ecosystem: "" })
    mockedFindCpe.mockResolvedValue({ cpe: "cpe:2.3:a:paloaltonetworks:pan-os:11.0.0:*:*:*:*:*:*:*" })

    const res = await GET(exportRequest())
    const vex = await res.json()

    expect(mockedFindCpe).toHaveBeenCalledWith("CVE-2026-1111", "PAN-OS")
    expect(vex.components[0]).toMatchObject({ purl: "pkg:generic/PAN-OS@11.0.0", cpe: "cpe:2.3:a:paloaltonetworks:pan-os:11.0.0:*:*:*:*:*:*:*" })
  })

  it("exports nothing when there are no ignored alerts", async () => {
    const res = await GET(exportRequest())
    const vex = await res.json()
    expect(vex.components).toEqual([])
    expect(vex.vulnerabilities).toEqual([])
  })

  it("rejects an unauthenticated request", async () => {
    const { auth } = await import("@/lib/auth")
    ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await GET(exportRequest())
    expect(res.status).toBe(401)
  })
})
