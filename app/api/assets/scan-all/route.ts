import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { runScanAll, scanAllStatus, type ScanAllRun } from "@/lib/scan-all-run"

function view(run: ScanAllRun | null) {
  if (!run) return null
  return {
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    done: run.done,
    total: run.total,
    failed: run.failed,
    error: run.error,
  }
}

/** Whether a scan of every asset is running, how far it is, and how the last one ended. */
export const GET = withApiErrorHandling("assets.scanAll.status", async () => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { running, last } = scanAllStatus()
  return NextResponse.json({ running: view(running), last: view(last) })
})

/**
 * Scan every asset again, one after another, in the background: 202 at once,
 * then GET says how far it is. 409 while a run is going, started here or by the
 * schedule. The finished run is recorded in the audit log.
 */
export const POST = withApiErrorHandling("assets.scanAll.start", async () => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (scanAllStatus().running) {
    return NextResponse.json({ error: "A scan of all assets is already running." }, { status: 409 })
  }

  const by = session.user.email ?? null
  runScanAll("manual", by)
    .then((run) => {
      if (!run) return
      return createAuditLog({
        userId: session.user.id, userEmail: session.user.email,
        action: "assets_rescanned",
        detail: `${run.total} assets, ${run.failed} failed`,
      })
    })
    .catch((err) => logger.error("assets.scanAll failed", { error: err instanceof Error ? err.message : String(err) }))

  return NextResponse.json({ running: view(scanAllStatus().running) }, { status: 202 })
})
