import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { prisma } from "@/lib/db"
import { getScanStatuses, isScanStale, staleAfterMs } from "@/lib/scan-status"

/**
 * Says so when scanning is not working, and nothing otherwise. A failed scan is
 * recorded on its job, and a scan that never ran leaves no record at all, so the
 * two are reported apart: assets whose latest scan failed, and no scan having
 * succeeded for a day and a half (the scheduler may be down, or off).
 */
export async function ScanHealthNotice() {
  const [assets, statuses] = await Promise.all([
    prisma.asset.findMany({ select: { id: true, name: true, hostname: true } }),
    getScanStatuses(),
  ])
  if (assets.length === 0) return null

  const failed = assets.filter((a) => statuses.get(a.id)?.lastAttempt?.failed)
  const successes = [...statuses.values()].flatMap((s) => (s.lastSuccessAt ? [s.lastSuccessAt] : []))
  const newestSuccess = successes.length > 0 ? new Date(Math.max(...successes.map((d) => d.getTime()))) : null
  const everScanned = [...statuses.values()].some((s) => s.lastAttempt)
  // A new installation that has not scanned yet is not a problem to report.
  const stale = everScanned && isScanStale(newestSuccess, new Date())
  if (failed.length === 0 && !stale) return null

  const firstError = failed.map((a) => statuses.get(a.id)?.lastAttempt?.error).find(Boolean)?.split("\n")[0].slice(0, 160)
  const hours = Math.round(staleAfterMs() / 3_600_000)

  return (
    <div role="alert" className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
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
  )
}
