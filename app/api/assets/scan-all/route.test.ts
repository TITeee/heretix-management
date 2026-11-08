import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ScanAllProgress, ScanAllResult } from "@/lib/scan"

let finish: (r: ScanAllResult) => void = () => {}
let report: (p: ScanAllProgress) => void = () => {}
vi.mock("@/lib/scan", () => ({
  scanAllAssets: vi.fn((onProgress?: (p: ScanAllProgress) => void) => {
    report = (p) => onProgress?.(p)
    return new Promise<ScanAllResult>((resolve) => { finish = resolve })
  }),
}))
const createAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({ createAuditLog: (...args: unknown[]) => createAuditLog(...args) }))
const auth = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => auth() }))

const { GET, POST } = await import("./route")
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

describe("/api/assets/scan-all", () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("heretix.scanAllRun")]
    createAuditLog.mockClear()
    auth.mockResolvedValue({ user: { id: "u1", email: "op@example.com", name: "Op", role: "operator" } })
  })

  it("starts a scan of every asset in the background and says how far it is", async () => {
    const started = await json(await POST())
    expect(started.status).toBe(202)
    expect(started.body.running).toMatchObject({ trigger: "manual", done: 0, finishedAt: null })

    report({ done: 1, total: 4, failed: 0 })
    expect((await json(await GET())).body.running).toMatchObject({ done: 1, total: 4 })

    finish({ total: 4, failures: [] })
    await vi.waitFor(() => expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userEmail: "op@example.com", action: "assets_rescanned", detail: "4 assets, 0 failed",
    })))
    const after = (await json(await GET())).body
    expect(after.running).toBeNull()
    expect(after.last).toMatchObject({ total: 4, failed: 0, error: null })
  })

  it("refuses a second run while one is going", async () => {
    await POST()
    expect(await json(await POST())).toEqual({ status: 409, body: { error: "A scan of all assets is already running." } })
    finish({ total: 0, failures: [] })
  })

  it("needs a signed-in user", async () => {
    auth.mockResolvedValue(null)
    expect((await POST()).status).toBe(401)
    expect((await GET()).status).toBe(401)
  })
})
