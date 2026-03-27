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
