import { schedule } from "node-cron"
import { refreshMetadata } from "@/lib/refresh"
import { scanAllAssets } from "@/lib/scan"

export function startScheduler() {
  const refreshSchedule = process.env.CRON_REFRESH ?? "0 12 * * *"
  const scanSchedule = process.env.CRON_SCAN ?? "0 13 * * *"

  schedule(refreshSchedule, () => {
    refreshMetadata().catch((err) => {
      console.error("[scheduler] refreshMetadata failed:", err)
    })
  })

  schedule(scanSchedule, () => {
    scanAllAssets().catch((err) => {
      console.error("[scheduler] scanAllAssets failed:", err)
    })
  })

  console.log(`[scheduler] started — refresh: "${refreshSchedule}", scan: "${scanSchedule}"`)
}
