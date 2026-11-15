import { describe, it, expect } from "vitest"
import { WRITE_SLICE, writeInSlices } from "./in-slices"

describe("writeInSlices", () => {
  it("writes every row once, in order, in slices of the given size", async () => {
    const rows = Array.from({ length: 1_050 }, (_, i) => i)
    const slices: number[][] = []
    await writeInSlices(rows, async (s) => { slices.push(s) }, 250)
    expect(slices.map((s) => s.length)).toEqual([250, 250, 250, 250, 50])
    expect(slices.flat()).toEqual(rows)
  })

  it("does not write when there is nothing", async () => {
    let calls = 0
    await writeInSlices([], async () => { calls++ })
    expect(calls).toBe(0)
  })

  it("writes one slice at a time, and stops at the first failure", async () => {
    let running = 0
    let peak = 0
    let calls = 0
    await expect(writeInSlices([1, 2, 3, 4, 5, 6], async () => {
      calls++
      running++
      peak = Math.max(peak, running)
      await Promise.resolve()
      running--
      if (calls === 2) throw new Error("db down")
    }, 2)).rejects.toThrow("db down")
    expect(peak).toBe(1)
    expect(calls).toBe(2)
  })

  it("uses a slice that keeps one bulk insert small", () => {
    expect(WRITE_SLICE).toBeLessThanOrEqual(500)
  })
})
