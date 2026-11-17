import { describe, it, expect, vi, beforeEach } from "vitest"

const runRefresh = vi.fn()
const refreshRunningSince = vi.fn()
vi.mock("@/lib/refresh-run", () => ({ runRefresh: () => runRefresh(), refreshRunningSince: () => refreshRunningSince() }))
const auth = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => auth() }))

const { POST } = await import("./route")

describe("POST /api/alerts/refresh", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", email: "op@example.com" } })
    runRefresh.mockReset()
    refreshRunningSince.mockReset()
  })

  it("answers with the counts of the refresh it ran", async () => {
    runRefresh.mockResolvedValue({ updated: 2, failed: 1, total: 9 })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 2, failed: 1 })
  })

  it("answers 409 with when the running one started, and starts nothing", async () => {
    runRefresh.mockResolvedValue(null)
    refreshRunningSince.mockReturnValue(new Date("2026-11-15T06:53:11Z"))
    const res = await POST()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("already running (started 06:53 UTC)")
  })
})
