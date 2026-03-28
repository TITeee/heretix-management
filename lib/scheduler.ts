import { schedule } from "node-cron"
import { refreshMetadata } from "@/lib/refresh"
import { scanAllAssets } from "@/lib/scan"
import { logger } from "@/lib/logger"

export function startScheduler() {
  const refreshSchedule = process.env.CRON_REFRESH ?? "0 12 * * *"
  const scanSchedule = process.env.CRON_SCAN ?? "0 13 * * *"

  schedule(refreshSchedule, () => {
    refreshMetadata().catch((err) => {
      logger.error("scheduler: refreshMetadata failed", { error: err instanceof Error ? err.message : String(err) })
    })
  })

  schedule(scanSchedule, () => {
    scanAllAssets().catch((err) => {
      logger.error("scheduler: scanAllAssets failed", { error: err instanceof Error ? err.message : String(err) })
    })
  })

  logger.info("scheduler started", { refreshSchedule, scanSchedule })
}
