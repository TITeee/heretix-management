import type { Prisma } from "@prisma/client"

export const SEVERITY_COLORS = {
  critical: "#4c0519",
  high:     "#9f1239",
  medium:   "#e11d48",
  low:      "#fb7185",
  na:       "#e5e5e5",
} as const

export const STATUS_COLORS = {
  open:        "#e11d48",
  in_progress: "#3b82f6",
  resolved:    "#16a34a",
  ignored:     "#6b7280",
} as const

export const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In Progress",
  resolved:    "Resolved",
  ignored:     "Ignored",
}

export type SeverityTier = keyof typeof SEVERITY_COLORS

export function getSeverityTier(score: number | null): SeverityTier {
  if (!score) return "na"
  if (score >= 9) return "critical"
  if (score >= 7) return "high"
  if (score >= 4) return "medium"
  return "low"
}

/**
 * THE severity tier of an alert, and the only place one is decided: every
 * count, chart, badge colour, filter, Slack threshold and SLA due date goes
 * through here, so no two screens can disagree about the same alert.
 *
 * The severity field is the source of truth. It is the rating for the CVSS
 * version the score came from (NVD's baseSeverity, a GHSA rating, or one
 * heretix-api derived from the score), so a CVSS v2 10.0 is HIGH, as v2
 * defines it, not Critical. Re-bucketing the score against v3 thresholds
 * would get that wrong. The score is only a fallback, for a severity-less
 * alert from older data or an older heretix-api; beyond that it is a number
 * to show and sort by.
 */
export function getAlertSeverityTier(severity: string | null | undefined, score: number | null | undefined): SeverityTier {
  switch (severity?.toUpperCase()) {
    case "CRITICAL": return "critical"
    case "HIGH": return "high"
    // GHSA's word for medium; heretix-api normalizes it now, older rows may still carry it.
    case "MEDIUM": case "MODERATE": return "medium"
    case "LOW": return "low"
    default: return getSeverityTier(score ?? null)
  }
}

// The stored severity words getAlertSeverityTier recognises, per tier.
const SEVERITY_WORDS: Record<Exclude<SeverityTier, "na">, string[]> = {
  critical: ["CRITICAL"],
  high: ["HIGH"],
  medium: ["MEDIUM", "MODERATE"],
  low: ["LOW"],
}

// The score fallback's ranges (getSeverityTier); a score of 0 or none is N/A.
const SCORE_RANGES: Record<Exclude<SeverityTier, "na">, Prisma.FloatNullableFilter> = {
  critical: { gte: 9 },
  high: { gte: 7, lt: 9 },
  medium: { gte: 4, lt: 7 },
  low: { gt: 0, lt: 4 },
}

/**
 * A Prisma filter for the alerts getAlertSeverityTier puts in `tier`, so a
 * server-side `?severity=` filter returns exactly what the badges count.
 * Severity is matched as stored (uppercase, which is what heretix-api writes).
 */
export function severityTierWhere(tier: SeverityTier): Prisma.AlertWhereInput {
  const unrated: Prisma.AlertWhereInput = {
    OR: [{ severity: null }, { severity: { notIn: Object.values(SEVERITY_WORDS).flat() } }],
  }
  if (tier === "na") return { AND: [unrated, { OR: [{ cvssScore: null }, { cvssScore: 0 }] }] }
  return { OR: [{ severity: { in: SEVERITY_WORDS[tier] } }, { AND: [unrated, { cvssScore: SCORE_RANGES[tier] }] }] }
}

/** "CRITICAL" / "HIGH" / "MEDIUM" / "LOW" / "UNKNOWN" (AlertSummaryBadges' keys) to a tier. */
export function severityTierFromKey(key: string): SeverityTier | null {
  const tiers: Record<string, SeverityTier> = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low", UNKNOWN: "na" }
  return tiers[key.toUpperCase()] ?? null
}

export type SeverityCounts = Record<SeverityTier, number>

export function emptySeverityCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, na: 0 }
}

/** Alert counts per severity tier (getAlertSeverityTier). */
export function countSeverity(alerts: { severity: string | null; cvssScore: number | null }[]): SeverityCounts {
  const counts = emptySeverityCounts()
  for (const alert of alerts) counts[getAlertSeverityTier(alert.severity, alert.cvssScore)]++
  return counts
}

/**
 * Alert counts per severity tier (getAlertSeverityTier), grouped by `keyOf`
 * (an asset id, a package name, ...).
 */
export function countSeverityByKey<T extends { severity: string | null; cvssScore: number | null }>(
  alerts: T[],
  keyOf: (alert: T) => string,
): Map<string, SeverityCounts> {
  const byKey = new Map<string, SeverityCounts>()
  for (const alert of alerts) {
    const key = keyOf(alert)
    const counts = byKey.get(key) ?? emptySeverityCounts()
    counts[getAlertSeverityTier(alert.severity, alert.cvssScore)]++
    byKey.set(key, counts)
  }
  return byKey
}
