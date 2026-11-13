import { prisma } from "@/lib/db"

/**
 * Settings key for pausing the scans nobody starts by hand: the scheduled scan of every asset
 * and the scan after an upload with ?scan=true. For while heretix-api is being restored or
 * reloaded, when an incomplete database would make alerts look gone. A scan someone starts
 * (Run Scan, Rescan All, a package edit) still runs.
 */
export const SCANS_PAUSED_KEY = "SCANS_PAUSED"

export async function areAutoScansPaused(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: SCANS_PAUSED_KEY }, select: { value: true } })
  return row?.value === "true"
}
