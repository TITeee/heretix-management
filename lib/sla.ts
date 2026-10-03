/**
 * SLA (Service Level Agreement) calculation utilities for vulnerability alerts
 */

import { getAlertSeverityTier, type SeverityTier } from "@/lib/severity"

// Per severity tier (getAlertSeverityTier); the CVSS ranges are what a tier
// means for a CVSS v3/v4 score.
export interface SlaConfig {
  slaEnabled: boolean
  slaCriticalHours: number  // Critical (CVSS 9.0-10)
  slaHighHours: number      // High (CVSS 7.0-8.9)
  slaMediumDays: number     // Medium (CVSS 4.0-6.9)
  slaLowDays: number        // Low (CVSS 0.1-3.9)
  kevSlaHours: number       // KEV (any severity)
}

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  slaEnabled: true,
  slaCriticalHours: 24,
  slaHighHours: 168,    // 7 days
  slaMediumDays: 30,
  slaLowDays: 90,
  kevSlaHours: 6,
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Calculate due date for an alert based on its severity tier, KEV status, and SLA config
 *
 * Rules:
 * - If alert is KEV, use fixed KEV SLA (hours)
 * - Otherwise, the SLA for its severity tier (getAlertSeverityTier: the
 *   severity field, with the CVSS score only as a fallback), so an alert
 *   rated MEDIUM with no score still gets a due date, and a CVSS v2 10.0
 *   (HIGH under v2) gets the High SLA, not the Critical one
 * - No tier (N/A: unrated, or CVSS 0.0 "none") means no SLA
 * - dueDate = detectedAt + SLA duration
 */
export function calculateDueDate(
  severity: string | null,
  cvssScore: number | null,
  isKev: boolean,
  detectedAt: Date,
  config: SlaConfig = DEFAULT_SLA_CONFIG
): Date | null {
  // KEV overrides the severity-based SLA
  if (isKev) {
    return new Date(detectedAt.getTime() + config.kevSlaHours * HOUR_MS)
  }

  const durationMs: Record<SeverityTier, number | null> = {
    critical: config.slaCriticalHours * HOUR_MS,
    high: config.slaHighHours * HOUR_MS,
    medium: config.slaMediumDays * DAY_MS,
    low: config.slaLowDays * DAY_MS,
    na: null,
  }
  const ms = durationMs[getAlertSeverityTier(severity, cvssScore)]
  return ms === null ? null : new Date(detectedAt.getTime() + ms)
}

/**
 * Get SLA status for an alert
 * - "overdue": dueDate < now
 * - "urgent": dueDate < now + 24h
 * - "warning": dueDate < now + 7d
 * - "ok": otherwise
 * - "unscored": no dueDate could be calculated (no severity tier and not KEV),
 *   distinct from "ok" so these don't silently look "safe" when they simply
 *   haven't been rated yet
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

  // Math.floor rounds a negative diffMs toward -Infinity, not toward zero, so
  // flooring it directly would inflate every overdue duration by one unit
  // (e.g. 1 second overdue reads as "1 day"). Take the magnitude first so the
  // overdue branch floors an always-positive elapsed time, same as the
  // not-yet-due branch below.
  if (diffMs < 0) {
    const overdueMs = -diffMs
    const overdueDays = Math.floor(overdueMs / (24 * 60 * 60 * 1000))
    const overdueHours = Math.floor((overdueMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    if (overdueDays > 0) {
      return `Overdue by ${overdueDays} day${overdueDays > 1 ? "s" : ""}`
    }
    return `Overdue by ${overdueHours}h`
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""}`
  }

  if (diffHours > 0) {
    return `${diffHours}h`
  }

  return "< 1h"
}
