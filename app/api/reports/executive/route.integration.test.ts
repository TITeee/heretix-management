import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "operator@example.com", name: "Operator", role: "operator" } }),
}))

const get = (query: string) => GET(new NextRequest(`http://localhost/api/reports/executive?${query}`))

describe("/api/reports/executive", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("writes the per-tag table as CSV, a row for every asset tag when none is chosen", async () => {
    await prisma.tag.createMany({ data: [{ name: "Production", type: "asset" }, { name: "openssl", type: "package" }] })
    const res = await get("period=since&since=2026-10-01")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    const today = new Date().toISOString().slice(0, 10)
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="executive-summary-2026-10-01-to-${today}.csv"`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // the byte order mark
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('"Scope"')).toBe(true)
    expect(text.split("\r\n").slice(1).map((line) => line.split(",")[0])).toEqual(['"All assets"', '"Production"', '"No tag"'])
  })

  it("gives the whole report as JSON, and refuses a period it cannot read", async () => {
    const json = await (await get("period=last_30_days&tags=&format=json")).json()
    expect(json.scopes.map((s: { label: string }) => s.label)).toEqual(["All assets", "No tag"])

    const bad = await get("period=since&since=2026-10-32")
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: "The first day must be written YYYY-MM-DD" })
  })
})
