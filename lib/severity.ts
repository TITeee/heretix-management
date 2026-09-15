// export const SEVERITY_COLORS = {
//   critical: "#ef4444",
//   high:     "#fb923c",
//   medium:   "#fde047",
//   low:      "#60a5fa",
//   na:       "#d1d5db",
// } as const

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

// Some sources (e.g. GHSA advisories, CNA records) set a qualitative severity
// without a numeric CVSS score. Falling back to getSeverityTier(score) alone
// would misclassify those as N/A even though the vendor already told us the
// tier, so the severity string — the same field the rest of the app buckets
// by (per-package badges, tag/asset Open Alert Summary, severity= filters) —
// takes priority whenever it's set.
export function getAlertSeverityTier(severity: string | null, score: number | null): SeverityTier {
  switch (severity?.toUpperCase()) {
    case "CRITICAL": return "critical"
    case "HIGH": return "high"
    case "MEDIUM": return "medium"
    case "LOW": return "low"
    default: return getSeverityTier(score)
  }
}
