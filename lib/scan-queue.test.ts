import { describe, it, expect } from "vitest"
import { createLimiter, scanConcurrency } from "./scan-queue"

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("createLimiter", () => {
  it("runs one task at a time with a limit of one, first come first served", async () => {
    const limiter = createLimiter(1)
    const order: string[] = []
    let peak = 0
    const task = (name: string) => limiter.run(async () => {
      peak = Math.max(peak, limiter.running)
      order.push(`start ${name}`)
      await tick()
      order.push(`end ${name}`)
      return name
    })
    const results = await Promise.all([task("a"), task("b"), task("c")])
    expect(results).toEqual(["a", "b", "c"])
    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"])
    expect(peak).toBe(1)
    expect(limiter.running).toBe(0)
    expect(limiter.waiting).toBe(0)
  })

  it("lets the next task run when one fails, and passes the failure on", async () => {
    const limiter = createLimiter(1)
    const failed = limiter.run(async () => { throw new Error("heretix-api down") })
    const next = limiter.run(async () => "ran")
    await expect(failed).rejects.toThrow("heretix-api down")
    await expect(next).resolves.toBe("ran")
  })

  it("runs up to the limit side by side", async () => {
    const limiter = createLimiter(2)
    let peak = 0
    await Promise.all([1, 2, 3, 4].map(() => limiter.run(async () => { peak = Math.max(peak, limiter.running); await tick() })))
    expect(peak).toBe(2)
  })

  it("says how many wait", async () => {
    const seen: number[] = []
    const limiter = createLimiter(1, (w) => seen.push(w))
    await Promise.all([1, 2, 3].map(() => limiter.run(tick)))
    expect(seen).toEqual([1, 2])
  })
})

describe("scanConcurrency", () => {
  it("is one unless set to a whole number of at least one", () => {
    expect(scanConcurrency(undefined)).toBe(1)
    expect(scanConcurrency("")).toBe(1)
    expect(scanConcurrency("0")).toBe(1)
    expect(scanConcurrency("2.5")).toBe(1)
    expect(scanConcurrency("x")).toBe(1)
    expect(scanConcurrency("3")).toBe(3)
  })
})
