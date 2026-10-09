import { describe, it, expect } from "vitest"
import { decideAbsentAlerts, graceEndsAt, MISSING_GRACE_MS, type AbsentAlert } from "./scan-resolve"

const now = new Date("2026-10-10T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)
const HOUR = 60 * 60 * 1000

const alert = (id: string, cause: AbsentAlert["cause"], missingSince: Date | null = null): AbsentAlert => ({ id, cause, missingSince })

describe("decideAbsentAlerts", () => {
  it("resolves an updated or excluded package's alert at once", () => {
    const d = decideAbsentAlerts([alert("a", "package_updated"), alert("b", "package_excluded")], 100, now)
    expect(d.resolve).toEqual([{ id: "a", cause: "package_updated" }, { id: "b", cause: "package_excluded" }])
    expect(d.startMissing).toEqual([])
    expect(d.held).toEqual([])
  })

  it("starts the grace period at the first miss without resolving", () => {
    const d = decideAbsentAlerts([alert("a", "not_reported")], 100, now)
    expect(d).toEqual({ resolve: [], startMissing: ["a"], held: [] })
  })

  it("keeps waiting while the grace period has not run out, then resolves", () => {
    expect(decideAbsentAlerts([alert("a", "not_reported", ago(MISSING_GRACE_MS - HOUR))], 100, now).resolve).toEqual([])
    expect(decideAbsentAlerts([alert("a", "not_reported", ago(MISSING_GRACE_MS))], 100, now).resolve)
      .toEqual([{ id: "a", cause: "not_reported" }])
  })

  it("holds every ripe alert when a large share of the asset's open alerts would close at once", () => {
    const ripe = Array.from({ length: 12 }, (_, i) => alert(`r${i}`, "not_reported", ago(2 * MISSING_GRACE_MS)))
    const d = decideAbsentAlerts([...ripe, alert("u", "package_updated"), alert("n", "not_reported")], 40, now)
    expect(d.held).toHaveLength(12)
    // Updates and the start of a new grace period are unaffected by the breaker.
    expect(d.resolve).toEqual([{ id: "u", cause: "package_updated" }])
    expect(d.startMissing).toEqual(["n"])
  })

  it("does not trip below either threshold: too few alerts, or too small a share", () => {
    const nine = Array.from({ length: 9 }, (_, i) => alert(`r${i}`, "not_reported", ago(2 * MISSING_GRACE_MS)))
    expect(decideAbsentAlerts(nine, 10, now).held).toEqual([])

    const twelve = Array.from({ length: 12 }, (_, i) => alert(`r${i}`, "not_reported", ago(2 * MISSING_GRACE_MS)))
    expect(decideAbsentAlerts(twelve, 545, now).held).toEqual([])
    expect(decideAbsentAlerts(twelve, 545, now).resolve).toHaveLength(12)
  })
})

describe("graceEndsAt", () => {
  it("is the end of the grace period", () => {
    expect(graceEndsAt(ago(0)).getTime() - now.getTime()).toBe(MISSING_GRACE_MS)
  })
})
