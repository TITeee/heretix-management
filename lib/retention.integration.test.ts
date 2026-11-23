import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { AUDIT_MIN_DAYS, RETENTION_KEYS, SCAN_HISTORY_KEEP_PER_ASSET, countExpired, purgeHistory } from "./retention"

const NOW = new Date("2026-11-23T04:15:00Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)
const setting = (key: string, value: string) => prisma.setting.create({ data: { key, value } })

async function asset(hostname: string) {
  return prisma.asset.create({ data: { name: hostname, hostname, osId: "debian", osVersionId: "13", osName: "Debian 13" } })
}
const audit = (action: string, createdAt: Date) => prisma.auditLog.create({ data: { action, createdAt } })
const scan = (assetId: string, ageDays: number, status = "completed") =>
  prisma.scanJob.create({ data: { assetId, status, createdAt: daysAgo(ageDays), completedAt: status === "completed" ? daysAgo(ageDays) : null } })

describe("purgeHistory", () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("deletes nothing while no period is set", async () => {
    await audit("login", daysAgo(5000))
    const a = await asset("host-1")
    await scan(a.id, 5000)
    expect(await purgeHistory(NOW)).toEqual({ audit: 0, scan: 0 })
    expect(await prisma.auditLog.count()).toBe(1)
    expect(await prisma.scanJob.count()).toBe(1)
    expect(await prisma.auditLog.count({ where: { action: "history_purged" } })).toBe(0)
  })

  it("deletes audit rows older than the period, keeps the rest, and says so in one audit row", async () => {
    await setting(RETENTION_KEYS.audit, "365")
    await audit("old-1", daysAgo(400))
    await audit("old-2", daysAgo(366))
    await audit("recent", daysAgo(364))
    await audit("today", NOW)

    expect(await purgeHistory(NOW)).toEqual({ audit: 2, scan: 0 })
    const rest = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })
    expect(rest.map((r) => r.action)).toEqual(["recent", "today", "history_purged"])
    expect(rest.at(-1)!.detail).toBe("audit log: 2 rows older than 365 days")
  })

  it("never goes below the floor, whatever was stored", async () => {
    await setting(RETENTION_KEYS.audit, "1")
    await audit("old", daysAgo(AUDIT_MIN_DAYS + 1))
    await audit("inside-floor", daysAgo(AUDIT_MIN_DAYS - 1))
    await purgeHistory(NOW)
    expect((await prisma.auditLog.findMany({ where: { action: { not: "history_purged" } } })).map((r) => r.action)).toEqual(["inside-floor"])
  })

  it("works through a large backlog in batches", async () => {
    await setting(RETENTION_KEYS.audit, "365")
    await prisma.auditLog.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ action: `old-${i}`, createdAt: daysAgo(500) })) })
    await prisma.auditLog.create({ data: { action: "recent", createdAt: daysAgo(1) } })
    expect(await purgeHistory(NOW, 10)).toEqual({ audit: 25, scan: 0 })
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "old-" } } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: "recent" } })).toBe(1)
  })

  describe("scan history", () => {
    it("deletes old scans but keeps the newest of every asset and its last successful one", async () => {
      await setting(RETENTION_KEYS.scan, "90")
      const busy = await asset("busy")
      // 30 daily scans, 100 to 129 days old: all older than the period, 10 of them the newest.
      for (let d = 100; d < 130; d++) await scan(busy.id, d)
      const idle = await asset("idle")
      // An asset not scanned for a year: its last scans stay, a failed one on top of its last good one.
      await scan(idle.id, 400)
      await scan(idle.id, 380, "failed")
      for (let d = 370; d < 375; d++) await scan(idle.id, d, "failed")

      const result = await purgeHistory(NOW)
      expect(await prisma.scanJob.count({ where: { assetId: busy.id } })).toBe(SCAN_HISTORY_KEEP_PER_ASSET)
      // idle has 7 scans: all kept (the newest 10 cover them)
      expect(await prisma.scanJob.count({ where: { assetId: idle.id } })).toBe(7)
      expect(result.scan).toBe(20)
    })

    it("keeps an asset's last successful scan even when 10 failed ones came after it", async () => {
      await setting(RETENTION_KEYS.scan, "90")
      const a = await asset("flaky")
      const good = await scan(a.id, 300)
      for (let d = 120; d < 132; d++) await scan(a.id, d, "failed")
      await purgeHistory(NOW)
      expect(await prisma.scanJob.findUnique({ where: { id: good.id } })).not.toBeNull()
      expect(await prisma.scanJob.count({ where: { assetId: a.id } })).toBe(SCAN_HISTORY_KEEP_PER_ASSET + 1)
    })

    it("does not touch a running scan or one newer than the period", async () => {
      await setting(RETENTION_KEYS.scan, "90")
      const a = await asset("host-2")
      for (let d = 200; d < 215; d++) await scan(a.id, d)
      const running = await scan(a.id, 500, "running")
      const recent = await scan(a.id, 30)
      await purgeHistory(NOW)
      expect(await prisma.scanJob.findUnique({ where: { id: running.id } })).not.toBeNull()
      expect(await prisma.scanJob.findUnique({ where: { id: recent.id } })).not.toBeNull()
    })

    it("leaves alerts, their events and package history alone", async () => {
      await setting(RETENTION_KEYS.scan, "90")
      await setting(RETENTION_KEYS.audit, "365")
      const a = await asset("host-3")
      const alert = await prisma.alert.create({
        data: { assetId: a.id, packageName: "p", packageVersion: "1", ecosystem: "npm", externalId: "CVE-2020-0001", sources: ["osv"], detectedAt: daysAgo(2000) },
      })
      await prisma.alertEvent.create({ data: { alertId: alert.id, type: "detected", createdAt: daysAgo(2000) } })
      await prisma.packageHistory.create({ data: { assetId: a.id, packageName: "p", ecosystem: "npm", action: "added", newVersion: "1", changedAt: daysAgo(2000) } })
      await purgeHistory(NOW)
      expect(await prisma.alert.count()).toBe(1)
      expect(await prisma.alertEvent.count()).toBe(1)
      expect(await prisma.packageHistory.count()).toBe(1)
    })
  })
})

describe("countExpired", () => {
  beforeEach(async () => {
    await resetDb()
  })

  it("counts what the purge would delete, with the same rules, without deleting", async () => {
    const a = await asset("host-4")
    for (let d = 100; d < 130; d++) await scan(a.id, d)
    await audit("old", daysAgo(400))
    await audit("new", daysAgo(10))

    const counts = await countExpired({ auditDays: 365, scanDays: 90 }, NOW)
    expect(counts.audit).toMatchObject({ total: 2, expired: 1 })
    expect(counts.scan).toMatchObject({ total: 30, expired: 30 - SCAN_HISTORY_KEEP_PER_ASSET })
    expect(await prisma.scanJob.count()).toBe(30)

    expect(await countExpired({ auditDays: null, scanDays: null }, NOW)).toMatchObject({ audit: { expired: 0 }, scan: { expired: 0 } })
  })
})
