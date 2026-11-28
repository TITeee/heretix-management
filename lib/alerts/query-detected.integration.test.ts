import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { allListAlertIds, listAlertPage } from "@/lib/alerts/query"
import { parseAlertQuery } from "@/lib/alerts/query-params"

// The Alerts list's "Detected" range: a day end is the whole UTC day, an instant end is itself.
describe("the Alerts list's detected range", () => {
  let assetId: string
  const at = (iso: string) => new Date(iso)

  beforeEach(async () => {
    await resetDb()
    const asset = await prisma.asset.create({ data: { name: "h", hostname: "h", osId: "u", osVersionId: "1", osName: "u" } })
    assetId = asset.id
    const add = async (packageName: string, externalId: string, detectedAt: Date, sourcePackage?: string) => {
      await prisma.alert.create({
        data: { assetId, packageName, packageVersion: "1", ecosystem: "npm", externalId, sources: ["osv"], detectedAt, ...(sourcePackage ? { sourcePackage } : {}) },
      })
    }
    // Around the edges of 2026-11-10 (UTC).
    await add("before", "CVE-1", at("2026-11-09T23:59:59.999Z"))
    await add("start", "CVE-2", at("2026-11-10T00:00:00.000Z"))
    await add("middle", "CVE-3", at("2026-11-10T12:30:00.000Z"))
    await add("end", "CVE-4", at("2026-11-10T23:59:59.999Z"))
    await add("after", "CVE-5", at("2026-11-11T00:00:00.000Z"))
    // One finding (source package, version, vulnerability) detected on two days.
    await add("libfoo", "CVE-6", at("2026-11-05T10:00:00.000Z"), "foo")
    await add("libfoo-dev", "CVE-6", at("2026-11-10T10:00:00.000Z"), "foo")
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const names = async (params: Record<string, string>) =>
    (await listAlertPage(parseAlertQuery({ status: "", ...params }))).rows.map((r) => r.packageName).sort()

  it("takes a day as the whole UTC day, both ends included", () =>
    names({ detectedFrom: "2026-11-10", detectedTo: "2026-11-10" }).then((n) =>
      expect(n).toEqual(["end", "libfoo-dev", "middle", "start"])))

  it("takes an instant as itself, both ends included to the millisecond", async () => {
    expect(await names({ detectedFrom: "2026-11-10T00:00:00.000Z", detectedTo: "2026-11-10T12:30:00.000Z" })).toEqual(["libfoo-dev", "middle", "start"])
    expect(await names({ detectedFrom: "2026-11-10T00:00:00.001Z", detectedTo: "2026-11-10T23:59:59.998Z" })).toEqual(["libfoo-dev", "middle"])
  })

  it("leaves either end open", async () => {
    expect(await names({ detectedFrom: "2026-11-10T23:59:59.999Z" })).toEqual(["after", "end"])
    expect(await names({ detectedTo: "2026-11-05" })).toEqual(["libfoo"])
  })

  it("lists only the alerts of a row that fall in the range, and carries them to a bulk change", async () => {
    // libfoo and libfoo-dev are one row of the list (the same finding); the range holds one of them.
    const page = await listAlertPage(parseAlertQuery({ status: "", detectedFrom: "2026-11-10", detectedTo: "2026-11-10", q: "libfoo" }))
    expect(page.rows.map((r) => r.packageName)).toEqual(["libfoo-dev"])
    expect(page.rows[0]._groupMembers).toBeUndefined()
    expect(page.total).toBe(1)
    const all = await allListAlertIds(parseAlertQuery({ status: "", detectedFrom: "2026-11-10", detectedTo: "2026-11-10" }))
    expect(all.rowCount).toBe(4)
    expect(all.alertIds).toHaveLength(4)
  })

  it("ignores an end that is not a day or an instant", async () => {
    // No range at all: every alert, with libfoo and libfoo-dev as one row.
    expect(await names({ detectedFrom: "yesterday", detectedTo: "2026-02-30" })).toHaveLength(6)
  })
})
