import { schedule } from "node-cron"
import { refreshMetadata } from "@/lib/refresh"
import { recordRefreshStatus, refreshFailed } from "@/lib/refresh-status"
import { scanAllAssets, failInterruptedScanJobs } from "@/lib/scan"
import { logger } from "@/lib/logger"
import { notifySlackRefreshFailed, notifySlackScanFailures, notifySlackScanNotRun } from "@/lib/slack"

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
    refreshMetadata()
      // A Slack message that cannot be sent is not a failed refresh.
      .then((result) => (refreshFailed({ ...result, error: null }) ? notifySlackRefreshFailed(result).catch(() => {}) : undefined))
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        logger.error("scheduler: refreshMetadata failed", { error })
        recordRefreshStatus({ total: 0, failed: 0, error })
          .then(() => notifySlackRefreshFailed({ total: 0, failed: 0, error }))
          .catch(() => {})
      })
  })

  schedule(scanSchedule, () => {
    scanAllAssets()
      // One Slack message for the whole run; a notification that itself fails must not become another failure.
      .then((result) => notifySlackScanFailures(result))
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        logger.error("scheduler: scanAllAssets failed", { error })
        notifySlackScanNotRun(error).catch(() => {})
      })
  })

  logger.info("scheduler started", { refreshSchedule, scanSchedule })
}
