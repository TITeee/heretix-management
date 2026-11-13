import { schedule } from "node-cron"
import { refreshMetadata } from "@/lib/refresh"
import { recordRefreshStatus, refreshFailed } from "@/lib/refresh-status"
import { failInterruptedScanJobs } from "@/lib/scan"
import { runScanAll } from "@/lib/scan-all-run"
import { logger } from "@/lib/logger"
import { areAutoScansPaused } from "@/lib/scan-pause"
import { notifySlackRefreshFailed, notifySlackScanFailures, notifySlackScanNotRun } from "@/lib/slack"

export function startScheduler() {
  // Nothing survived the restart that brought us here, so any job still marked
  // running belongs to the process that stopped.
  failInterruptedScanJobs().catch((err) => {
    logger.error("scheduler: failInterruptedScanJobs failed", { error: err instanceof Error ? err.message : String(err) })
  })

  // The refresh runs once a day, after heretix-api has imported KEV (09:00) and EPSS
  // (10:00). A scan costs a request or two per asset, so it runs every three hours, so
  // that what heretix-api imports during the day reaches the alerts the same day. :45
  // keeps it off the minutes heretix-api imports in (the 12:45 scan follows the 12:00
  // refresh; 15:45 and 18:45 follow the CVE Record and Microsoft imports at 15:30 and
  // 18:30). The defaults have to match .env.example and docker-compose.yml.
  const refreshSchedule = process.env.CRON_REFRESH ?? "0 12 * * *"
  const scanSchedule = process.env.CRON_SCAN ?? "45 */3 * * *"

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

  schedule(scanSchedule, async () => {
    // Paused in Settings: say so in the log each time, so a pause nobody lifted shows up there too.
    if (await areAutoScansPaused().catch(() => false)) {
      logger.warn("scheduler: automatic scans are paused in Settings, skipping the scheduled scan")
      return
    }
    runScanAll("schedule")
      // One Slack message for the whole run; a notification that itself fails must not become another failure.
      .then((run) => {
        // A run started from the Assets page is still going: it covers today.
        if (!run) { logger.info("scheduler: a scan of all assets is already running, skipping"); return }
        return notifySlackScanFailures({ total: run.total, failures: run.failures })
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        logger.error("scheduler: scanAllAssets failed", { error })
        notifySlackScanNotRun(error).catch(() => {})
      })
  })

  logger.info("scheduler started", { refreshSchedule, scanSchedule })
}
