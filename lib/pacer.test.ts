import { describe, it, expect } from "vitest"
import { createPacer } from "./pacer"

/** A clock and a sleep that advance it, so no real time passes. */
function fakeClock() {
  let t = 1_000_000
  const waits: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { waits.push(ms); t += ms },
    waits,
    elapsed: (from: number) => t - from,
    start: t,
  }
}

describe("createPacer", () => {
  it("lets the first request go at once and spaces the next ones 60000 / perMinute ms apart", async () => {
    const c = fakeClock()
    const pace = createPacer(600, c.now, c.sleep) // 100 ms apart
    await pace()
    await pace()
    await pace()
    expect(c.waits).toEqual([100, 100])
  })

  it("gives callers that ask together later slots, not the same one", async () => {
    const c = fakeClock()
    const pace = createPacer(60, c.now, c.sleep) // 1 s apart
    await Promise.all(Array.from({ length: 5 }, () => pace()))
    // The five started at the first, and 1, 2, 3 and 4 s after it.
    expect(c.elapsed(c.start)).toBeGreaterThanOrEqual(4_000)
    expect(c.waits).toHaveLength(4)
  })

  it("sends about perMinute in a minute: never more than one over, in any 60 seconds", async () => {
    const c = fakeClock()
    const perMinute = 900
    const pace = createPacer(perMinute, c.now, c.sleep)
    const startedAt: number[] = []
    for (let i = 0; i < 2_000; i++) {
      await pace()
      startedAt.push(c.now())
    }
    // Count the starts in every window of one minute from each start.
    let worst = 0
    for (let i = 0, j = 0; i < startedAt.length; i++) {
      while (startedAt[j] <= startedAt[i] - 60_000) j++
      worst = Math.max(worst, i - j + 1)
    }
    // Evenly spaced starts can put one more at each end of a window of exactly a minute.
    expect(worst).toBeLessThanOrEqual(perMinute + 1)
    expect(worst).toBeGreaterThanOrEqual(perMinute - 1)
  })

  it("does not wait after an idle spell: a request after a quiet minute goes at once", async () => {
    const c = fakeClock()
    const pace = createPacer(60, c.now, c.sleep)
    await pace()
    await c.sleep(120_000)
    c.waits.length = 0
    await pace()
    expect(c.waits).toEqual([])
  })

  it("does not pace for 0 or a value that is not a positive number", async () => {
    for (const n of [0, -5, Number.NaN]) {
      const c = fakeClock()
      const pace = createPacer(n, c.now, c.sleep)
      await Promise.all(Array.from({ length: 50 }, () => pace()))
      expect(c.waits).toEqual([])
    }
  })
})
