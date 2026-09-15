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
      style={tag.color ? { color: tag.color, borderColor: tag.color } : undefined}
    >
      {tag.name}
    </Badge>
  )
}
