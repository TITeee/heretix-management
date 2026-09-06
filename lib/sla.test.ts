import { describe, it, expect } from "vitest"
import { calculateDueDate, getSlaStatus, formatDaysUntilDue, DEFAULT_SLA_CONFIG } from "./sla"

const detectedAt = new Date("2026-01-01T00:00:00.000Z")

describe("calculateDueDate", () => {
  it("returns null when there is no CVSS score and the alert is not KEV", () => {
    expect(calculateDueDate(null, false, detectedAt)).toBeNull()
  })

  it("uses the KEV SLA even when there is no CVSS score", () => {
    const due = calculateDueDate(null, true, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.kevSlaHours * 60 * 60 * 1000))
  })

  it("prefers the KEV SLA over the CVSS-derived SLA", () => {
    const due = calculateDueDate(9.8, true, detectedAt)
    expect(due).toEqual(new Date(detectedAt.getTime() + DEFAULT_SLA_CONFIG.kevSlaHours * 60 * 60 * 1000))
  })

  it.each([
    [9.8, "slaCriticalHours", 60 * 60 * 1000],
    [9.0, "slaCriticalHours", 60 * 60 * 1000],
    [8.9, "slaHighHours", 60 * 60 * 1000],
    [7.0, "slaHighHours", 60 * 60 * 1000],
    [6.9, "slaMediumDays", 24 * 60 * 60 * 1000],
    [4.0, "slaMediumDays", 24 * 60 * 60 * 1000],
    [3.9, "slaLowDays", 24 * 60 * 60 * 1000],
    [0.0, "slaLowDays", 24 * 60 * 60 * 1000],
  ] as const)("maps CVSS %s to the %s tier", (score, configKey, unitMs) => {
    const due = calculateDueDate(score, false, detectedAt)
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
