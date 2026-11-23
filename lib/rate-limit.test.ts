import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const MIN = 60 * 1000
const T0 = new Date("2026-11-23T12:00:00Z").getTime()

// Each test gets a limiter of its own: the buckets are module state.
async function fresh() {
  vi.resetModules()
  return import("./rate-limit")
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
})

describe("the login limits", () => {
  it("stops an email after 5 failures and an address after 20, until the window is over", async () => {
    const rl = await fresh()
    for (let i = 0; i < 4; i++) rl.recordLoginFailure("a@example.com", `192.0.2.${i}`)
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(false)
    rl.recordLoginFailure("a@example.com", "192.0.2.9")
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(true)
    expect(rl.isLoginRateLimited("other@example.com", "198.51.100.1")).toBe(false)

    for (let i = 0; i < 20; i++) rl.recordLoginFailure(`u${i}@example.com`, "203.0.113.5")
    expect(rl.isLoginRateLimited("fresh@example.com", "203.0.113.5")).toBe(true)

    vi.setSystemTime(T0 + 15 * MIN + 1)
    expect(rl.isLoginRateLimited("a@example.com", "203.0.113.5")).toBe(false)
  })

  it("lets a successful sign-in clear the email's count", async () => {
    const rl = await fresh()
    for (let i = 0; i < 5; i++) rl.recordLoginFailure("a@example.com", "192.0.2.1")
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(true)
    rl.clearLoginRateLimit("a@example.com")
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(false)
  })
})

describe("the token limit", () => {
  it("stops an address after 20 failed tokens", async () => {
    const rl = await fresh()
    for (let i = 0; i < 19; i++) rl.recordTokenAuthFailure("192.0.2.1")
    expect(rl.isTokenAuthRateLimited("192.0.2.1")).toBe(false)
    rl.recordTokenAuthFailure("192.0.2.1")
    expect(rl.isTokenAuthRateLimited("192.0.2.1")).toBe(true)
    expect(rl.isTokenAuthRateLimited("192.0.2.2")).toBe(false)
  })
})

describe("buckets that have expired", () => {
  it("are swept by a later failure, not kept until the process restarts", async () => {
    const rl = await fresh()
    for (let i = 0; i < 1000; i++) rl.recordLoginFailure(`user${i}@example.com`, `10.0.${i % 250}.${Math.floor(i / 250)}`)
    expect(rl.rateLimitBucketCounts()).toMatchObject({ email: 1000, ip: 1000 })

    vi.setSystemTime(T0 + 16 * MIN)
    rl.recordLoginFailure("later@example.com", "192.0.2.50")
    expect(rl.rateLimitBucketCounts()).toMatchObject({ email: 1, ip: 1 })
  })

  it("are swept for the token limiter too", async () => {
    const rl = await fresh()
    for (let i = 0; i < 500; i++) rl.recordTokenAuthFailure(`10.1.${Math.floor(i / 250)}.${i % 250}`)
    expect(rl.rateLimitBucketCounts().token).toBe(500)
    vi.setSystemTime(T0 + 16 * MIN)
    rl.recordTokenAuthFailure("192.0.2.50")
    expect(rl.rateLimitBucketCounts().token).toBe(1)
  })

  it("are only swept when they have expired: a live window still counts", async () => {
    const rl = await fresh()
    for (let i = 0; i < 5; i++) rl.recordLoginFailure("a@example.com", "192.0.2.1")
    vi.setSystemTime(T0 + 10 * MIN)
    rl.recordLoginFailure("b@example.com", "192.0.2.2") // runs the sweep
    expect(rl.rateLimitBucketCounts().email).toBe(2)
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(true)
  })

  it("are swept at most once a minute, so a flood does not scan the map on every failure", async () => {
    const rl = await fresh()
    rl.recordLoginFailure("old@example.com", "192.0.2.1")
    vi.setSystemTime(T0 + 15 * MIN + 1)
    rl.recordLoginFailure("a@example.com", "192.0.2.2") // sweeps: old is gone
    expect(rl.rateLimitBucketCounts().email).toBe(1)
    vi.setSystemTime(T0 + 15 * MIN + 1 + 30 * 1000)
    rl.recordLoginFailure("b@example.com", "192.0.2.3") // under a minute since: no sweep needed, nothing wrongly dropped
    expect(rl.rateLimitBucketCounts().email).toBe(2)
  })
})

describe("the cap", () => {
  it("keeps each limiter to MAX_BUCKETS, dropping the oldest windows first", async () => {
    const rl = await fresh()
    for (let i = 0; i < 5; i++) rl.recordLoginFailure("first@example.com", "192.0.2.1")
    expect(rl.isLoginRateLimited("first@example.com", "198.51.100.1")).toBe(true)

    for (let i = 0; i < rl.MAX_BUCKETS + 100; i++) rl.recordLoginFailure(`flood${i}@example.com`, `fl-${i}`)
    expect(rl.rateLimitBucketCounts().email).toBe(rl.MAX_BUCKETS)
    expect(rl.rateLimitBucketCounts().ip).toBe(rl.MAX_BUCKETS)
    // The oldest window went; the newest are all still tracked.
    expect(rl.isLoginRateLimited("first@example.com", "198.51.100.1")).toBe(false)
    for (let i = 0; i < 4; i++) rl.recordLoginFailure(`flood${rl.MAX_BUCKETS + 99}@example.com`, "192.0.2.77")
    expect(rl.isLoginRateLimited(`flood${rl.MAX_BUCKETS + 99}@example.com`, "198.51.100.1")).toBe(true)
  })

  it("holds for the token limiter, which no password hash slows down", async () => {
    const rl = await fresh()
    for (let i = 0; i < rl.MAX_BUCKETS + 500; i++) rl.recordTokenAuthFailure(`addr-${i}`)
    expect(rl.rateLimitBucketCounts().token).toBe(rl.MAX_BUCKETS)
  })

  it("does not count a window that starts again as a new bucket", async () => {
    const rl = await fresh()
    rl.recordLoginFailure("a@example.com", "192.0.2.1")
    vi.setSystemTime(T0 + 16 * MIN)
    for (let i = 0; i < 3; i++) rl.recordLoginFailure("a@example.com", "192.0.2.1")
    expect(rl.rateLimitBucketCounts().email).toBe(1)
    expect(rl.isLoginRateLimited("a@example.com", "198.51.100.1")).toBe(false) // 3 failures in the new window
  })
})
