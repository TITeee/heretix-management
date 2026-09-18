import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export function TagBadge({
  tag,
  className,
}: {
  tag: { id: string; name: string; color: string | null }
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", className)}
      // Tag colors are arbitrary user-picked hex values, not fixed Tailwind
      // shades, so the border is muted by blending toward transparent
      // (color-mix) rather than picking a lighter swatch of the same hue —
      // full-strength color reads better as text than as a border.
      style={
        tag.color
          ? { color: tag.color, borderColor: `color-mix(in srgb, ${tag.color} 70%, transparent)` }
          : undefined
      }
    >
      {tag.name}
    </Badge>
  )
}
