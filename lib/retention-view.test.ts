import { describe, it, expect } from "vitest"
import { choicesWith, retentionState } from "./retention-view"

const counts = (total: number, expired: number, oldest: string | null = "2026-01-05T00:00:00Z") => ({ total, expired, oldest })

describe("retentionState", () => {
  it("is neutral while the counts are not in yet", () => {
    expect(retentionState(undefined, "365")).toMatchObject({ tone: "neutral", badge: "Counting" })
  })

  it("is neutral, and says nothing is deleted, when everything is kept", () => {
    const s = retentionState(counts(1234, 0), "")
    expect(s).toMatchObject({ tone: "neutral", badge: "Keeping everything" })
    expect(s.text).toContain("1,234 rows")
    expect(s.text).toContain("Oldest from")
  })

  it("is green when a period is on and no row is older than it", () => {
    expect(retentionState(counts(80, 0), "365")).toEqual({
      tone: "ok", badge: "Deleting after 365 days", text: "80 rows. None older than 365 days.",
    })
  })

  it("is amber, with the count, when rows older than the period wait for the next run", () => {
    expect(retentionState(counts(2000, 1500), "90")).toEqual({
      tone: "warn",
      badge: "1,500 to delete",
      text: "1,500 of 2,000 rows are older than 90 days. They are deleted at the next daily run.",
    })
  })
})

describe("choicesWith", () => {
  const base: [string, string][] = [["90", "90 days"], ["365", "1 year"]]

  it("leaves the usual periods as they are", () => {
    expect(choicesWith(base, "")).toBe(base)
    expect(choicesWith(base, "365")).toBe(base)
  })

  it("adds a period set some other way, in order, so the selector can show it", () => {
    expect(choicesWith(base, "200")).toEqual([["90", "90 days"], ["200", "200 days"], ["365", "1 year"]])
    expect(choicesWith(base, "1000")).toEqual([["90", "90 days"], ["365", "1 year"], ["1000", "1000 days"]])
  })
})
