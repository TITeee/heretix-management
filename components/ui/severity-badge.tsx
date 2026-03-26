import { Badge } from "@/components/ui/badge"
import { SEVERITY_COLORS } from "@/lib/severity"

export function SeverityBadge({ score }: { score: number | null }) {
  if (!score) return <Badge variant="outline">n/a</Badge>
  if (score >= 9) return <Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white">Critical</Badge>
  if (score >= 7) return <Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white">High</Badge>
  if (score >= 4) return <Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white">Medium</Badge>
  return <Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white">Low</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "open")        return <Badge variant="destructive">Open</Badge>
  if (status === "in_progress") return <Badge className="bg-blue-500 text-white">In Progress</Badge>
  if (status === "ignored")     return <Badge variant="secondary">Ignored</Badge>
  return <Badge className="bg-green-600 text-white">Resolved</Badge>
}
