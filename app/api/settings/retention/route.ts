import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { AUDIT_MIN_DAYS, SCAN_HISTORY_KEEP_PER_ASSET, SCAN_HISTORY_MIN_DAYS, RETENTION_KEYS, countExpired, effectiveDays, retentionProblem } from "@/lib/retention"

/**
 * What a retention period would delete now, so that the Settings page can say so before
 * the period is saved: `?auditDays=365&scanDays=90` (an empty or missing one keeps everything).
 */
export const GET = withApiErrorHandling("settings.retention", async (req: NextRequest) => {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const auditDays = params.get("auditDays") ?? ""
  const scanDays = params.get("scanDays") ?? ""
  const problem = retentionProblem(RETENTION_KEYS.audit, auditDays) ?? retentionProblem(RETENTION_KEYS.scan, scanDays)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const counts = await countExpired({
    auditDays: effectiveDays(RETENTION_KEYS.audit, auditDays),
    scanDays: effectiveDays(RETENTION_KEYS.scan, scanDays),
  })
  return NextResponse.json({
    audit: { ...counts.audit, minDays: AUDIT_MIN_DAYS },
    scan: { ...counts.scan, minDays: SCAN_HISTORY_MIN_DAYS, keptPerAsset: SCAN_HISTORY_KEEP_PER_ASSET },
  })
})
