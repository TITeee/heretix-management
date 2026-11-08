import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ScanAllProgress, ScanAllResult } from "@/lib/scan"

// A scan of all assets that the test finishes by hand.
let finish: (r: ScanAllResult) => void = () => {}
let fail: (e: Error) => void = () => {}
let report: (p: ScanAllProgress) => void = () => {}
vi.mock("@/lib/scan", () => ({
  scanAllAssets: vi.fn((onProgress?: (p: ScanAllProgress) => void) => {
    report = (p) => onProgress?.(p)
    return new Promise<ScanAllResult>((resolve, reject) => { finish = resolve; fail = reject })
  }),
}))

const { runScanAll, scanAllStatus } = await import("./scan-all-run")

describe("runScanAll", () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("heretix.scanAllRun")]
  })

  it("runs one at a time: a second call while one runs returns null at once", async () => {
    const first = runScanAll("manual", "a@example.com")
    expect(scanAllStatus().running).toMatchObject({ trigger: "manual", by: "a@example.com" })
    expect(await runScanAll("schedule")).toBeNull()
    finish({ total: 0, failures: [] })
    expect(await first).not.toBeNull()
  })

  it("shows how far it is, then keeps the finished run as the last one", async () => {
    const run = runScanAll("manual")
    report({ done: 0, total: 3, failed: 0 })
    report({ done: 2, total: 3, failed: 1 })
    expect(scanAllStatus().running).toMatchObject({ done: 2, total: 3, failed: 1, finishedAt: null })
    finish({ total: 3, failures: [{ assetId: "x", assetName: "x", error: "boom" }] })
    await run
    const { running, last } = scanAllStatus()
    expect(running).toBeNull()
    expect(last).toMatchObject({ total: 3, failed: 1, error: null })
    expect(last!.finishedAt).toBeInstanceOf(Date)
    expect(last!.failures).toHaveLength(1)
  })

  it("frees the slot and records the error when the run itself fails", async () => {
    const run = runScanAll("schedule")
    fail(new Error("database is down"))
    await expect(run).rejects.toThrow("database is down")
    expect(scanAllStatus().running).toBeNull()
    expect(scanAllStatus().last).toMatchObject({ error: "database is down" })
    const next = runScanAll("manual")
    expect(scanAllStatus().running).not.toBeNull()
    finish({ total: 0, failures: [] })
    await next
  })
})
