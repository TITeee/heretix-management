import { describe, it, expect } from "vitest"
import { judge } from "./status"
import type { ScopeNumbers } from "./executive"

function scope(open: { kevOverdue?: number; malicious?: number }, onTimeRate: number | null, trendOverdue: number[]) {
  return {
    open: { alerts: 0, kev: 0, critical: 0, overdue: 0, overdueLong: 0, kevOverdue: 0, malicious: 0, ...open },
    period: { onTimeRate },
    trendOverdue,
  } as unknown as ScopeNumbers
}

describe("judge", () => {
  it("is on track with nothing exploited past due, nothing malicious, the target met and no more past due", () => {
    expect(judge(scope({}, 0.95, [10, 8]), 0.9)).toEqual({ level: "on_track", reasons: [] })
    // Nothing resolved with a due date, and no history: nothing to fall behind on.
    expect(judge(scope({}, null, []), 0.9)).toEqual({ level: "on_track", reasons: [] })
  })

  it("is behind target under the target rate or with more open past due than at the start", () => {
    expect(judge(scope({}, 0.72, [120, 180]), 0.9)).toEqual({
      level: "behind",
      reasons: [
        "72% were resolved by the due date against a 90% target",
        "open findings past the due date rose from 120 to 180",
      ],
    })
    expect(judge(scope({}, 0.9, [5, 5]), 0.9).level).toBe("on_track")
  })

  it("needs action with a known exploited finding past due or a malicious package open, whatever else holds", () => {
    expect(judge(scope({ kevOverdue: 1, malicious: 2 }, 0.5, [1, 2]), 0.9)).toEqual({
      level: "action",
      reasons: [
        "1 known exploited finding is past the due date",
        "2 malicious packages are open",
        "50% were resolved by the due date against a 90% target",
        "open findings past the due date rose from 1 to 2",
      ],
    })
  })
})
