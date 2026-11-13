import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { DELETE } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "op@example.com", name: "Op", role: "operator" } }),
}))

let alertId = ""
let otherAlertId = ""

function del(id: string) {
  return DELETE(new NextRequest(`http://localhost/api/alerts/${id}/chat`, { method: "DELETE" }), { params: Promise.resolve({ id }) })
}

describe("DELETE /api/alerts/[id]/chat", () => {
  beforeEach(async () => {
    await resetDb()
    const asset = await prisma.asset.create({
      data: { name: "host-1", hostname: "host-1", osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
    })
    const mk = (externalId: string) => prisma.alert.create({
      data: { assetId: asset.id, packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm", externalId, sources: ["osv"], status: "open" },
    })
    alertId = (await mk("CVE-2026-0001")).id
    otherAlertId = (await mk("CVE-2026-0002")).id
    await prisma.alertChatMessage.createMany({
      data: [
        { alertId, role: "assistant", content: "analysis" },
        { alertId, role: "user", content: "question" },
        { alertId: otherAlertId, role: "assistant", content: "other" },
      ],
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("clears one alert's conversation, leaves the others, and records it", async () => {
    const res = await del(alertId)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    expect(await prisma.alertChatMessage.count({ where: { alertId } })).toBe(0)
    expect(await prisma.alertChatMessage.count({ where: { alertId: otherAlertId } })).toBe(1)
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "ai_chat_cleared" } })
    expect(log).toMatchObject({ target: alertId, userEmail: "op@example.com", detail: "CVE-2026-0001: 2 messages" })
  })

  it("records nothing when there was nothing to clear", async () => {
    await del(alertId)
    await del(alertId)
    expect(await prisma.auditLog.count({ where: { action: "ai_chat_cleared" } })).toBe(1)
  })

  it("is 404 for an alert that does not exist", async () => {
    expect((await del("nope")).status).toBe(404)
  })

  it("needs a signed-in user", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    expect((await del(alertId)).status).toBe(401)
    expect(await prisma.alertChatMessage.count({ where: { alertId } })).toBe(2)
  })
})
