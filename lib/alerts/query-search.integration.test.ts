import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { listAlertPage } from "@/lib/alerts/query"
import { parseAlertQuery } from "@/lib/alerts/query-params"

// The Alerts list's searches look for the text as typed: % and _ are no wildcards.
describe("the Alerts list's package and vulnerability searches", () => {
  beforeEach(async () => {
    await resetDb()
    const asset = await prisma.asset.create({ data: { name: "h", hostname: "h", osId: "u", osVersionId: "1", osName: "u" } })
    const add = async (packageName: string, externalId: string) => {
      await prisma.package.create({ data: { assetId: asset.id, name: packageName, version: "1", rawVersion: "1", ecosystem: "npm", source: "sbom", deps: [] } })
      await prisma.alert.create({ data: { assetId: asset.id, packageName, packageVersion: "1", ecosystem: "npm", externalId, sources: ["osv"] } })
    }
    await add("pkg-100%", "CVE-2026-0001")
    await add("pkg-1000", "CVE-2026-0002")
    await add("a_b", "CVE_2026-0003")
    await add("axb", "CVEX2026-0004")
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const packages = async (params: Record<string, string>) =>
    (await listAlertPage(parseAlertQuery({ status: "", ...params }))).rows.map((r) => r.packageName).sort()

  it("searches the package name for the text as typed", async () => {
    expect(await packages({ q: "100%" })).toEqual(["pkg-100%"])
    expect(await packages({ q: "%" })).toEqual(["pkg-100%"])
    expect(await packages({ q: "a_b" })).toEqual(["a_b"])
    expect(await packages({ q: "PKG-10" })).toEqual(["pkg-100%", "pkg-1000"])
  })

  it("searches the vulnerability id for the text as typed", async () => {
    expect(await packages({ vuln: "CVE_" })).toEqual(["a_b"])
    expect(await packages({ vuln: "_" })).toEqual(["a_b"])
    expect(await packages({ vuln: "2026-000" })).toEqual(["a_b", "axb", "pkg-100%", "pkg-1000"])
  })
})
