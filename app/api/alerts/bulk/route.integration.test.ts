import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { POST } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/alerts/bulk", { method: "POST", body: JSON.stringify(body) }))
}

let assetId = ""
let n = 0
async function createAlert(overrides: Partial<Prisma.AlertUncheckedCreateInput> = {}) {
  return prisma.alert.create({
    data: {
      assetId, packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm",
      externalId: `CVE-2026-${String(++n).padStart(4, "0")}`, sources: ["osv"], status: "open", ...overrides,
    },
  })
}

describe("POST /api/alerts/bulk", () => {
  beforeEach(async () => {
    await resetDb()
    const asset = await prisma.asset.create({
      data: { name: "host-1", hostname: "host-1", osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
    })
    assetId = asset.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("changes the selected alerts as one-by-one changes would, with an event each", async () => {
    const a = await createAlert()
    const b = await createAlert({
      status: "ignored", ignoreReason: "not_affected", vexJustification: "vulnerable_code_not_present", reopenOnFix: true, notApplicableByScan: true,
    })
    const res = await post({ status: "resolved", ids: [a.id, b.id] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 2, unchanged: 0 })

    const after = await prisma.alert.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { externalId: "asc" } })
    for (const alert of after) {
      expect(alert).toMatchObject({ status: "resolved", ignoreReason: null, vexJustification: null, reopenOnFix: false, notApplicableByScan: false })
      expect(alert.resolvedAt).not.toBeNull()
    }
    const events = await prisma.alertEvent.findMany({ orderBy: { alertId: "asc" } })
    expect(events.map((e) => [e.alertId, e.type, (e.data as { from: string }).from])).toEqual(
      [[a.id, "status_changed", "open"], [b.id, "status_changed", "ignored"]].sort()
    )
    expect(await prisma.auditLog.count({ where: { action: "alerts_status_changed" } })).toBe(1)
  })

  it("leaves alerts already in that status alone", async () => {
    const a = await createAlert({ status: "in_progress" })
    const b = await createAlert()
    const res = await post({ status: "in_progress", ids: [a.id, b.id] })
    expect(await res.json()).toEqual({ updated: 1, unchanged: 1 })
    expect(await prisma.alertEvent.count({ where: { alertId: a.id } })).toBe(0)
  })

  it("clears resolvedAt when an alert is reopened", async () => {
    const a = await createAlert({ status: "resolved", resolvedAt: new Date() })
    await post({ status: "open", ids: [a.id] })
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: a.id } })).resolvedAt).toBeNull()
  })

  it("changes every alert of a filtered view, as the list counts its rows", async () => {
    await createAlert({ severity: "HIGH" })
    await createAlert({ severity: "HIGH" })
    await createAlert({ severity: "LOW" })
    const res = await post({ status: "in_progress", query: "severity=high", expectedRows: 2 })
    expect(await res.json()).toEqual({ updated: 2, unchanged: 0 })
    expect(await prisma.alert.count({ where: { status: "in_progress" } })).toBe(2)
  })

  it("refuses when the view no longer has the rows the user confirmed", async () => {
    await createAlert({ severity: "HIGH" })
    const res = await post({ status: "resolved", query: "severity=high", expectedRows: 5 })
    expect(res.status).toBe(409)
    expect((await res.json()).rows).toBe(1)
    expect(await prisma.alert.count({ where: { status: "resolved" } })).toBe(0)
  })

  it("does not ignore in bulk, which needs a reason per alert", async () => {
    const a = await createAlert()
    const res = await post({ status: "ignored", ids: [a.id] })
    expect(res.status).toBe(400)
  })

  it("rejects a body with neither ids nor a view", async () => {
    expect((await post({ status: "open" })).status).toBe(400)
  })
})
