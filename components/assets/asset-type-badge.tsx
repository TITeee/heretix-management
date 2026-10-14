import { FaDocker, FaServer } from "react-icons/fa6"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** What kind of asset it is, as a badge: a Docker image or a host. Shared by the Assets list and the asset page. */
export function AssetTypeBadge({ assetType, className }: { assetType: string; className?: string }) {
  const isImage = assetType === "docker_image"
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-muted-foreground", className)}>
      {isImage ? <FaDocker className="shrink-0" /> : <FaServer className="shrink-0" />}
      {isImage ? "Docker Image" : "Host"}
    </Badge>
  )
}
