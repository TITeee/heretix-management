import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { prisma } from "@/lib/db"
import { getScanStatuses, isScanStale, staleAfterMs } from "@/lib/scan-status"
import { getRefreshStatus, refreshFailed } from "@/lib/refresh-status"

/**
 * Says so when scanning or the metadata refresh is not working, and nothing
 * otherwise. A failed scan is recorded on its job, and a scan that never ran leaves
 * no record at all, so the two are reported apart: assets whose latest scan failed,
 * and no scan having succeeded for a day and a half (the scheduler may be down, or
 * off). The refresh is the same: its last outcome, and how long since it last worked.
 */
export async function ScanHealthNotice() {
  const [assets, statuses, refresh] = await Promise.all([
    prisma.asset.findMany({ select: { id: true, name: true, hostname: true } }),
    getScanStatuses(),
    getRefreshStatus(),
  ])

  const failed = assets.filter((a) => statuses.get(a.id)?.lastAttempt?.failed)
  const successes = [...statuses.values()].flatMap((s) => (s.lastSuccessAt ? [s.lastSuccessAt] : []))
  const newestSuccess = successes.length > 0 ? new Date(Math.max(...successes.map((d) => d.getTime()))) : null
  const everScanned = [...statuses.values()].some((s) => s.lastAttempt)
  // A new installation that has not scanned yet is not a problem to report.
  const stale = assets.length > 0 && everScanned && isScanStale(newestSuccess, new Date())

  // Same for the refresh: nothing recorded yet is a new installation, not a failure.
  const refreshBad = refresh !== null && refreshFailed(refresh)
  const refreshStale = refresh !== null && !refreshBad && isScanStale(new Date(refresh.at), new Date())
  const refreshLastGood = refresh?.lastSuccessAt ? new Date(refresh.lastSuccessAt) : null

  const scanProblem = failed.length > 0 || stale
  if (!scanProblem && !refreshBad && !refreshStale) return null

  const firstError = failed.map((a) => statuses.get(a.id)?.lastAttempt?.error).find(Boolean)?.split("\n")[0].slice(0, 160)
  const hours = Math.round(staleAfterMs() / 3_600_000)

  return (
    <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      {scanProblem && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {failed.length > 0
              ? `${failed.length} of ${assets.length} asset${assets.length === 1 ? "" : "s"} failed ${failed.length === 1 ? "its" : "their"} latest scan`
              : `No scan has succeeded for over ${hours} hours`}
          </p>
          {failed.length > 0 && (
            <p className="text-xs">
              {firstError && <>Error: <span className="font-mono">{firstError}</span>. </>}
              Their alerts are as the last successful scan left them, so the lists may be out of date.
            </p>
          )}
          {failed.length > 0 && (
            <p className="flex flex-wrap gap-x-3 text-xs">
              {failed.slice(0, 6).map((a) => (
                <Link key={a.id} href={`/assets/${a.id}`} className="underline underline-offset-2">{a.name || a.hostname}</Link>
              ))}
              {failed.length > 6 && <span>and {failed.length - 6} more</span>}
            </p>
          )}
          <p className="text-xs" suppressHydrationWarning>
            {newestSuccess
              ? `Last successful scan: ${newestSuccess.toLocaleString()}.`
              : "No scan has succeeded yet."}
            {stale && failed.length === 0 && " Scans run on a schedule (Settings → operations docs: CRON_SCAN); the server may be stopped or the scheduler off."}
          </p>
        </div>
      )}
      {(refreshBad || refreshStale) && refresh && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {refreshBad ? "The latest metadata refresh failed" : `The metadata refresh has not run for over ${hours} hours`}
          </p>
          <p className="text-xs" suppressHydrationWarning>
            {refreshBad && (refresh.error
              ? <>Error: <span className="font-mono">{refresh.error.split("\n")[0].slice(0, 160)}</span>. </>
              : `${refresh.failed} of ${refresh.total} vulnerability lookups failed. `)}
            CVSS, severity, EPSS and KEV on the alerts are as the last good refresh left them, so SLA due dates may be out of date.{" "}
            {refreshLastGood ? `Last good refresh: ${refreshLastGood.toLocaleString()}.` : "No refresh has succeeded yet."}
          </p>
        </div>
      )}
    </div>
  )
}
