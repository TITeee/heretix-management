import { describe, it, expect, vi, beforeEach } from "vitest"

let finish: (r: { updated: number; failed: number; total: number }) => void = () => {}
const refreshMetadata = vi.fn(() => new Promise<{ updated: number; failed: number; total: number }>((resolve) => { finish = resolve }))
vi.mock("@/lib/refresh", () => ({ refreshMetadata: () => refreshMetadata() }))

const { runRefresh, refreshRunningSince } = await import("./refresh-run")

describe("runRefresh", () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("heretix.refreshRun")]
    refreshMetadata.mockClear()
  })

  it("starts no second refresh while one runs, and allows the next once it ends", async () => {
    const first = runRefresh()
    expect(refreshRunningSince()).toBeInstanceOf(Date)

    expect(await runRefresh()).toBeNull()
    expect(refreshMetadata).toHaveBeenCalledTimes(1)

    finish({ updated: 3, failed: 0, total: 5 })
    expect(await first).toEqual({ updated: 3, failed: 0, total: 5 })
    expect(refreshRunningSince()).toBeNull()

    const next = runRefresh()
    expect(refreshMetadata).toHaveBeenCalledTimes(2)
    finish({ updated: 0, failed: 0, total: 5 })
    await next
  })

  it("frees the slot when a refresh fails", async () => {
    refreshMetadata.mockImplementationOnce(() => Promise.reject(new Error("heretix-api down")))
    await expect(runRefresh()).rejects.toThrow("heretix-api down")
    expect(refreshRunningSince()).toBeNull()
  })
})
