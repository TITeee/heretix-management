import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { GET, PATCH } from "./route"
import { POST as TEST_CONNECTION } from "./test/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin" } }),
}))

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/settings", { method: "PATCH", body: JSON.stringify(body) }))
const stored = async (key: string) => (await prisma.setting.findUnique({ where: { key } }))?.value

describe("/api/settings", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("sends secrets to the page masked, and other settings as they are", async () => {
    await prisma.setting.createMany({ data: [
      { key: "HERETIX_API_KEY", value: "0123456789abcdef" },
      { key: "SLACK_WEBHOOK_URL", value: "https://hooks.slack.com/services/T0/B0/secretpart" },
      { key: "HERETIX_API_URL", value: "http://localhost:5000" },
    ] })
    const body = await (await GET()).json()
    expect(body.HERETIX_API_KEY).toBe("••••cdef")
    expect(body.SLACK_WEBHOOK_URL).toBe("••••part")
    expect(body.HERETIX_API_URL).toBe("http://localhost:5000")
  })

  it("keeps a secret the page sent back masked, and saves one typed anew", async () => {
    await prisma.setting.create({ data: { key: "AI_API_KEY", value: "sk-ant-original-key" } })
    expect((await patch({ AI_API_KEY: "••••-key", AI_MODEL: "m" })).status).toBe(200)
    expect(await stored("AI_API_KEY")).toBe("sk-ant-original-key")
    expect(await stored("AI_MODEL")).toBe("m")

    expect((await patch({ AI_API_KEY: "sk-ant-new-key" })).status).toBe(200)
    expect(await stored("AI_API_KEY")).toBe("sk-ant-new-key")
  })

  it("refuses a key the Settings page does not save, writing nothing", async () => {
    const res = await patch({ AI_MODEL: "m", sla_config: "{}" })
    expect(res.status).toBe(400)
    expect(await stored("AI_MODEL")).toBeUndefined()
    expect(await stored("sla_config")).toBeUndefined()
  })

  it("checks URLs when saving, as the connection tests do", async () => {
    expect((await patch({ HERETIX_API_URL: "http://169.254.169.254" })).status).toBe(400)
    expect((await patch({ HERETIX_API_URL: "file:///etc/passwd" })).status).toBe(400)
    expect((await patch({ SLACK_WEBHOOK_URL: "http://hooks.slack.com/x" })).status).toBe(400)
    expect((await patch({ SLACK_WEBHOOK_URL: "" })).status).toBe(200) // clearing it is fine
    expect((await patch({ HERETIX_API_URL: "http://localhost:5000" })).status).toBe(200)
  })

  it("refuses a value that is not a string", async () => {
    expect((await patch({ SLACK_ENABLED: true })).status).toBe(400)
  })

  it("tests the connection with the stored key when the page sends the mask", async () => {
    await prisma.setting.create({ data: { key: "HERETIX_API_KEY", value: "stored-key-123456" } })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    try {
      const res = await TEST_CONNECTION(new NextRequest("http://localhost/api/settings/test", {
        method: "POST", body: JSON.stringify({ url: "http://localhost:5000", apiKey: "••••3456" }),
      }))
      expect(res.status).toBe(200)
      const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers["x-api-key"]).toBe("stored-key-123456")
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("answers a body over the limit with 413", async () => {
    const res = await patch({ AI_MODEL: "x".repeat(2 * 1024 * 1024) })
    expect(res.status).toBe(413)
  })
})
