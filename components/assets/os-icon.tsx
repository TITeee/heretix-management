import { FaWindows, FaLinux, FaUserPen } from "react-icons/fa6"
import { cn } from "@/lib/utils"

const LINUX_OS_IDS = new Set(["ubuntu", "debian", "alpine", "rocky", "almalinux", "rhel", "centos", "oraclelinux"])

/**
 * The icon for an asset's OS (Windows, Linux, or a manual registration), shared by the Assets list
 * and the asset page. Null for an OS with no icon, so the text stands alone.
 */
export function OSIcon({ osId, osName, className }: { osId: string; osName: string; className?: string }) {
  const id = osId.toLowerCase()
  const name = osName.toLowerCase()
  const cls = cn("h-4 w-4 shrink-0", className)
  if (id === "manual") return <FaUserPen className={cls} />
  if (id.includes("windows") || name.includes("windows")) return <FaWindows className={cls} />
  if (LINUX_OS_IDS.has(id) || name.includes("linux")) return <FaLinux className={cls} />
  return null
}
