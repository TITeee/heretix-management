import { describe, it, expect } from "vitest"
import { eventLine, formatEventTime, timelineText } from "./event-text"

const at = "2026-11-07T13:05:59Z"

describe("eventLine", () => {
  it("writes the time in UTC and the panel's headline", () => {
    expect(formatEventTime(at)).toBe("2026-11-07 13:05 UTC")
    expect(eventLine({ type: "detected", data: {}, createdAt: at })).toBe("2026-11-07 13:05 UTC Alert detected")
    expect(eventLine({ type: "package_changed", data: { from: "openssl@3.0.2", to: "openssl@3.0.13" }, createdAt: at }))
      .toBe("2026-11-07 13:05 UTC Package changed: openssl@3.0.2 → openssl@3.0.13")
  })

  it("adds who changed a status, the ignore reason and the reason given", () => {
    expect(eventLine({ type: "status_changed", data: { to: "ignored", userName: "Tanaka", ignoreReason: "false_positive" }, createdAt: at }))
      .toBe('2026-11-07 13:05 UTC Status changed to "Ignored"; by Tanaka; False positive')
    expect(eventLine({ type: "status_changed", data: { from: "open", to: "resolved", reason: "Auto-resolved: no longer reported by heretix-api" }, createdAt: at }))
      .toBe('2026-11-07 13:05 UTC Status changed to "Resolved"; Auto-resolved: no longer reported by heretix-api')
  })

  it("puts saved notes on the same line", () => {
    expect(eventLine({ type: "notes_saved", data: { userName: "Sato", notes: "line one\n\nline  two" }, createdAt: at }))
      .toBe("2026-11-07 13:05 UTC Notes saved; by Sato; notes: line one line two")
  })

  it("leaves out a type the timeline does not show", () => {
    expect(eventLine({ type: "something_new", data: {}, createdAt: at })).toBeNull()
  })
})

describe("timelineText", () => {
  it("lists the events oldest first, one per line, without unknown ones", () => {
    expect(timelineText([
      { type: "kev_added", data: null, createdAt: "2026-11-02T00:00:00Z" },
      { type: "unknown", data: {}, createdAt: "2026-11-03T00:00:00Z" },
      { type: "detected", data: {}, createdAt: "2026-11-01T00:00:00Z" },
    ])).toBe("2026-11-01 00:00 UTC Alert detected\n2026-11-02 00:00 UTC Added to CISA KEV")
    expect(timelineText([])).toBe("")
  })
})
