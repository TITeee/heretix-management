import { Badge } from "@/components/ui/badge"
import { SEVERITY_COLORS, getSeverityTier } from "@/lib/severity"

const TIER_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", na: "n/a" } as const

export function SeverityBadge({ score }: { score: number | null }) {
  const tier = getSeverityTier(score)
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
