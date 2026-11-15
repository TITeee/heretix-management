import { describe, expect, it } from "vitest"
import { demoModeBlocked, DEMO_MODE_MESSAGE, isDemoMode } from "./demo-mode"

describe("isDemoMode", () => {
  it("is on only for the exact value true", () => {
    expect(isDemoMode("true")).toBe(true)
    for (const v of [undefined, "", "false", "1", "TRUE", "yes"]) expect(isDemoMode(v)).toBe(false)
  })
})

describe("demoModeBlocked", () => {
  it("answers 403 with the reason in a demo", async () => {
    const res = demoModeBlocked("true")
    expect(res?.status).toBe(403)
    expect(await res?.json()).toEqual({ error: DEMO_MODE_MESSAGE })
  })

  it("lets the request through otherwise", () => {
    expect(demoModeBlocked("false")).toBeNull()
    expect(demoModeBlocked(undefined)).toBeNull()
  })
})
