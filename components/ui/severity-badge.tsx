import { Badge } from "@/components/ui/badge"
import { SEVERITY_COLORS, getAlertSeverityTier } from "@/lib/severity"

const TIER_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", na: "n/a" } as const

/** The tier's name, decided by getAlertSeverityTier (severity first, score as fallback). */
export function SeverityBadge({ score, severity }: { score: number | null; severity: string | null | undefined }) {
  const tier = getAlertSeverityTier(severity, score)
  return (
    <Badge
      style={{ backgroundColor: SEVERITY_COLORS[tier] }}
      className={tier === "na" ? "text-neutral-900" : "text-white"}
    >
      {TIER_LABELS[tier]}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "open")        return <Badge variant="destructive">Open</Badge>
  if (status === "in_progress") return <Badge className="bg-blue-500 text-white">In Progress</Badge>
  if (status === "ignored")     return <Badge variant="secondary">Ignored</Badge>
  return <Badge className="bg-green-600 text-white">Resolved</Badge>
}
