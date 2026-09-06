import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { PATCH } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/alerts/a1", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

function patch(id: string, body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ id }) })
}

async function createAlert(overrides: Partial<Parameters<typeof prisma.alert.create>[0]["data"]> = {}) {
  const asset = await prisma.asset.create({
    data: { name: "host-1", hostname: "host-1", osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
  })
  return prisma.alert.create({
    data: {
      assetId: asset.id,
      packageName: "lodash",
      packageVersion: "4.17.20",
      ecosystem: "npm",
      externalId: "CVE-2026-1111",
      sources: ["osv"],
      status: "open",
      ...overrides,
    },
  })
}

describe("PATCH /api/alerts/[id]", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    const res = await patch("missing-id", { status: "resolved" })
    expect(res.status).toBe(401)
  })

  it("requires an ignoreReason when setting status to ignored", async () => {
    const alert = await createAlert()
    const res = await patch(alert.id, { status: "ignored" })
    expect(res.status).toBe(400)
  })

  it("requires a justification when the ignore reason is not_affected", async () => {
    const alert = await createAlert()
    const res = await patch(alert.id, { status: "ignored", ignoreReason: "not_affected" })
    expect(res.status).toBe(400)
  })

  it("ignores with not_affected when a justification is supplied, and logs a status_changed event", async () => {
    const alert = await createAlert()
    const res = await patch(alert.id, {
      status: "ignored", ignoreReason: "not_affected", vexJustification: "code_not_present",
    })
    expect(res.status).toBe(200)

    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("ignored")
    expect(updated.ignoreReason).toBe("not_affected")
    expect(updated.vexJustification).toBe("code_not_present")

    const events = await prisma.alertEvent.findMany({ where: { alertId: alert.id } })
    expect(events.map((e) => e.type).sort()).toEqual(["status_changed", "vex_justification_set"])
  })

  it("ignores with accepted_risk without requiring a justification", async () => {
    const alert = await createAlert()
    const res = await patch(alert.id, { status: "ignored", ignoreReason: "accepted_risk" })
    expect(res.status).toBe(200)
    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("ignored")
    expect(updated.ignoreReason).toBe("accepted_risk")
    expect(updated.vexJustification).toBeNull()
  })

  it("clears ignoreReason and vexJustification when status leaves ignored", async () => {
    const alert = await createAlert({ status: "ignored", ignoreReason: "not_affected", vexJustification: "code_not_present" })
    await patch(alert.id, { status: "open" })
    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.status).toBe("open")
    expect(updated.ignoreReason).toBeNull()
    expect(updated.vexJustification).toBeNull()
  })

  it("logs ignore_reason_changed when the reason changes while status stays ignored", async () => {
    const alert = await createAlert({ status: "ignored", ignoreReason: "not_affected", vexJustification: "code_not_present" })
    const res = await patch(alert.id, { status: "ignored", ignoreReason: "accepted_risk" })
    expect(res.status).toBe(200)

    const events = await prisma.alertEvent.findMany({ where: { alertId: alert.id } })
    expect(events.map((e) => e.type)).toEqual(["ignore_reason_changed"])
  })

  it("drops the justification when the ignore reason is not not_affected", async () => {
    const alert = await createAlert()
    await patch(alert.id, {
      status: "ignored", ignoreReason: "accepted_risk", vexJustification: "should_be_dropped",
    })
    const updated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(updated.vexJustification).toBeNull()
  })

  it("sets resolvedAt when resolving, and clears it when moving away from resolved", async () => {
    const alert = await createAlert()
    const resolved = await patch(alert.id, { status: "resolved" })
    expect(resolved.status).toBe(200)
    const afterResolve = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(afterResolve.resolvedAt).not.toBeNull()

    await patch(alert.id, { status: "open" })
    const afterReopen = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
    expect(afterReopen.resolvedAt).toBeNull()
  })

  it("logs notes_saved only when notes are non-empty after trimming", async () => {
    const alert = await createAlert()
    await patch(alert.id, { notes: "   " })
    expect(await prisma.alertEvent.count({ where: { alertId: alert.id } })).toBe(0)

    await patch(alert.id, { notes: "investigating" })
    const events = await prisma.alertEvent.findMany({ where: { alertId: alert.id } })
    expect(events.map((e) => e.type)).toEqual(["notes_saved"])
  })
})
