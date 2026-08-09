import { schedule } from "node-cron"
import { refreshMetadata } from "@/lib/refresh"
import { scanAllAssets, failInterruptedScanJobs } from "@/lib/scan"
import { logger } from "@/lib/logger"

export function startScheduler() {
  // Nothing survived the restart that brought us here, so any job still marked
  // running belongs to the process that stopped.
  failInterruptedScanJobs().catch((err) => {
    logger.error("scheduler: failInterruptedScanJobs failed", { error: err instanceof Error ? err.message : String(err) })
  })

  // Metadata is refreshed before the scan runs, so a scan works from current advisory
  // data. The defaults have to stay in that order and match .env.example.
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
