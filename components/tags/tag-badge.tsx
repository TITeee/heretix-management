import { DoorOpen, Globe, Lock, Tag as TagIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

// Default tags get an icon that suggests what they mean; user-created tags share a plain tag icon.
// The names are matched only for default tags, so a user tag that happens to share one stays plain.
export function TagKindIcon({ name, isDefault }: { name: string; isDefault?: boolean }) {
  if (!isDefault) return <TagIcon />
  if (name === "Internet Facing") return <Globe />
  if (name === "Public Endpoint") return <DoorOpen />
  return <Lock />
}

export function TagBadge({
  tag,
  className,
}: {
  tag: { id: string; name: string; color: string | null; isDefault?: boolean }
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs font-medium", className)}
      // Tag colors are arbitrary user-picked hex values, not fixed Tailwind shades, so there is no
      // light or dark swatch to pick. The fill is the color at --tag-fill over whatever is behind
      // it. The text is the same color with only its lightness replaced by --tag-text-l (set per
      // theme in globals.css), so it keeps its hue and chroma, and a pale yellow is as readable as
      // a deep blue; blending with the foreground instead would be readable too but muddy.
      // A tag with no color keeps the plain secondary badge.
      style={
        tag.color
          ? {
              backgroundColor: `color-mix(in srgb, ${tag.color} var(--tag-fill), transparent)`,
              color: `oklch(from ${tag.color} var(--tag-text-l) c h)`,
            }
          : undefined
      }
    >
      <TagKindIcon name={tag.name} isDefault={tag.isDefault} />
      {tag.name}
    </Badge>
  )
}
