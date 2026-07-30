/**
 * SLA (Service Level Agreement) calculation utilities for vulnerability alerts
 */

export interface SlaConfig {
  slaEnabled: boolean
  slaCriticalHours: number  // CVSS 9.0-10
  slaHighHours: number      // CVSS 7.0-8.9
  slaMediumDays: number     // CVSS 4.0-6.9
  slaLowDays: number        // CVSS 0-3.9
  kevSlaHours: number       // KEV (all CVSS levels)
}

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  slaEnabled: true,
  slaCriticalHours: 24,
  slaHighHours: 168,    // 7 days
  slaMediumDays: 30,
  slaLowDays: 90,
  kevSlaHours: 6,
}

/**
 * Calculate due date for an alert based on CVSS score, KEV status, and SLA config
 *
 * Rules:
 * - If alert is KEV, use fixed KEV SLA (hours)
 * - Otherwise, determine SLA from CVSS score
 * - dueDate = detectedAt + SLA duration
 */
export function calculateDueDate(
  cvssScore: number | null,
  isKev: boolean,
  detectedAt: Date,
  config: SlaConfig = DEFAULT_SLA_CONFIG
): Date | null {
  // KEV overrides CVSS-based SLA
  if (isKev) {
    return new Date(detectedAt.getTime() + config.kevSlaHours * 60 * 60 * 1000)
  }

  // No CVSS score means no SLA
  if (cvssScore === null) {
    return null
  }

  // Determine SLA based on CVSS score
  let durationMs: number
  if (cvssScore >= 9.0) {
    // Critical: hours
    durationMs = config.slaCriticalHours * 60 * 60 * 1000
  } else if (cvssScore >= 7.0) {
    // High: hours
    durationMs = config.slaHighHours * 60 * 60 * 1000
  } else if (cvssScore >= 4.0) {
    // Medium: days
    durationMs = config.slaMediumDays * 24 * 60 * 60 * 1000
  } else {
    // Low: days
    durationMs = config.slaLowDays * 24 * 60 * 60 * 1000
  }

  return new Date(detectedAt.getTime() + durationMs)
}

/**
 * Get SLA status for an alert
 * - "overdue": dueDate < now
 * - "urgent": dueDate < now + 24h
 * - "warning": dueDate < now + 7d
 * - "ok": otherwise
 * - "unscored": no dueDate could be calculated (no CVSS score and not KEV),
 *   distinct from "ok" so these don't silently look "safe" when they simply
 *   haven't been scored yet
 */
export type SlaStatus = "overdue" | "urgent" | "warning" | "ok" | "unscored"

export function getSlaStatus(dueDate: Date | null, now: Date = new Date()): SlaStatus {
  if (!dueDate) return "unscored"

  if (dueDate < now) return "overdue"

  const hours24 = 24 * 60 * 60 * 1000
  const days7 = 7 * 24 * 60 * 60 * 1000

  const timeUntilDue = dueDate.getTime() - now.getTime()

  if (timeUntilDue < hours24) return "urgent"
  if (timeUntilDue < days7) return "warning"

  return "ok"
}

/**
 * Format remaining time until due date
 * Examples: "2 days", "3 hours", "Overdue by 1 day"
 */
export function formatDaysUntilDue(dueDate: Date | null, now: Date = new Date()): string {
  if (!dueDate) return "Unscored"

  const diffMs = dueDate.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

  if (diffMs < 0) {
    const overdueDays = Math.abs(diffDays)
    const overdueHours = Math.abs(diffHours)
    if (overdueDays > 0) {
      return `Overdue by ${overdueDays} day${overdueDays > 1 ? "s" : ""}`
    }
    return `Overdue by ${overdueHours}h`
  }

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""}`
  }

  if (diffHours > 0) {
    return `${diffHours}h`
  }

  return "< 1h"
}
