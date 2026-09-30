import { Badge } from "@/components/ui/badge"
import { SEVERITY_COLORS, type SeverityCounts } from "@/lib/severity"

/**
 * One filled badge per non-zero severity tier, or an outline "0" when there are
 * none: the Open Alerts cell used by the Assets list and the Tag detail tables.
 */
export function SeverityCountBadges({ counts }: { counts: SeverityCounts }) {
  const { critical, high, medium, low, na } = counts
  if (critical + high + medium + low + na === 0) return <Badge variant="outline" className="rounded-md">0</Badge>
  return (
    <div className="flex gap-1 flex-nowrap">
      {critical > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white rounded-md">{critical}</Badge>}
      {high > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white rounded-md">{high}</Badge>}
      {medium > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white rounded-md">{medium}</Badge>}
      {low > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white rounded-md">{low}</Badge>}
      {/* Filled from SEVERITY_COLORS like the other four rather than left as an
          outline badge, so this reads as the same "N/A" the dashboard charts show.
          Dark text, not the white the others use: SEVERITY_COLORS.na is a light grey. */}
      {na > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.na }} className="text-neutral-900 rounded-md">{na}</Badge>}
    </div>
  )
}
