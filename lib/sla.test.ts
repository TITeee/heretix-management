import { describe, it, expect } from "vitest"
import { calculateDueDate, getSlaStatus, formatDaysUntilDue, DEFAULT_SLA_CONFIG } from "./sla"

const detectedAt = new Date("2026-01-01T00:00:00.000Z")

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe("calculateDueDate", () => {
  it("returns null when there is no severity tier and the alert is not KEV", () => {
    expect(calculateDueDate(null, null, false, detectedAt)).toBeNull()
  })

  it("returns null for a CVSS 0.0 (\"none\") alert, which has no tier", () => {
    expect(calculateDueDate("NONE", 0, false, detectedAt)).toBeNull()
  })

  it("uses the KEV SLA even when there is no severity", () => {
    const due = calculateDueDate(null, null, true, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.kevSlaHours * HOUR))
  })

  it("prefers the KEV SLA over the severity-derived SLA", () => {
    const due = calculateDueDate("CRITICAL", 9.8, true, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.kevSlaHours * HOUR))
  })

  it("takes the tier from the severity, not from the score", () => {
    // CVSS v2 10.0 is HIGH on the v2 scale, which has no Critical.
    const due = calculateDueDate("HIGH", 10, false, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.slaHighHours * HOUR))
  })

  it("gives a rated alert with no score a due date", () => {
    const due = calculateDueDate("MEDIUM", null, false, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.slaMediumDays * DAY))
  })

  it.each([
    [9.8, "slaCriticalHours", HOUR],
    [9.0, "slaCriticalHours", HOUR],
    [8.9, "slaHighHours", HOUR],
    [7.0, "slaHighHours", HOUR],
    [6.9, "slaMediumDays", DAY],
    [4.0, "slaMediumDays", DAY],
    [3.9, "slaLowDays", DAY],
  ] as const)("falls back to CVSS %s for a severity-less alert: the %s tier", (score, configKey, unitMs) => {
    const due = calculateDueDate(null, score, false, detectedAt)
    const expectedMs = detectedAt.getTime() + DEFAULT_SLA_CONFIG[configKey] * unitMs
    expect(due).toEqual(new Date(expectedMs))
  })
})

describe("getSlaStatus", () => {
  const now = new Date("2026-01-10T00:00:00.000Z")

  it("returns 'unscored' when there is no due date", () => {
    expect(getSlaStatus(null, now)).toBe("unscored")
  })

  it("returns 'overdue' when the due date has passed", () => {
    expect(getSlaStatus(new Date(now.getTime() - 1), now)).toBe("overdue")
  })

  it("returns 'urgent' when due within 24 hours", () => {
    expect(getSlaStatus(new Date(now.getTime() + 23 * 60 * 60 * 1000), now)).toBe("urgent")
  })

  it("returns 'warning' when due within 7 days but after 24 hours", () => {
    expect(getSlaStatus(new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000), now)).toBe("warning")
  })

  it("returns 'ok' when due more than 7 days out", () => {
    expect(getSlaStatus(new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000), now)).toBe("ok")
  })
})

describe("formatDaysUntilDue", () => {
  const now = new Date("2026-01-10T00:00:00.000Z")

  it("returns 'Unscored' when there is no due date", () => {
    expect(formatDaysUntilDue(null, now)).toBe("Unscored")
  })

  it("formats a future due date in whole days", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 1000), now)).toBe("2 days")
  })

  it("formats a future due date under a day in whole hours", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() + 3 * 60 * 60 * 1000), now)).toBe("3h")
  })

  it("formats a future due date under an hour as '< 1h'", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() + 30 * 1000), now)).toBe("< 1h")
  })

  it("does not round a few seconds overdue up to a whole day", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() - 1000), now)).not.toBe("Overdue by 1 day")
  })

  it("formats a due date 30 minutes overdue as overdue by less than an hour, not a day", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() - 30 * 60 * 1000), now)).toBe("Overdue by 0h")
  })

  it("formats a due date exactly 25 hours overdue as 1 day overdue, not 2", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() - 25 * 60 * 60 * 1000), now)).toBe("Overdue by 1 day")
  })

  it("formats a due date exactly 48 hours overdue as 2 days overdue", () => {
    expect(formatDaysUntilDue(new Date(now.getTime() - 48 * 60 * 60 * 1000), now)).toBe("Overdue by 2 days")
  })
})
