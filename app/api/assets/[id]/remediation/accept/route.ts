import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { createAuditLog } from "@/lib/audit"

const DEFAULT_REASON = "No fix available: accepted until one is"

/**
 * Accepts a group of the asset's no-fix findings at once (Remediation view):
 * each becomes ignored with reason accepted_risk and reopenOnFix, so the next
 * scan that finds a fixed version reopens it. Only open or in-progress alerts
 * of this asset that have no fixedVersion are touched; any other id is skipped
 * and reported back, so a stale page can't accept a finding that has since
 * gained a fix.
 */
export const POST = withApiErrorHandling("assets.remediation.accept", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params
  const body = await req.json()
  const alertIds: unknown = body?.alertIds
  const memo = typeof body?.memo === "string" ? body.memo.trim() : ""
  if (!Array.isArray(alertIds) || alertIds.length === 0 || !alertIds.every((a) => typeof a === "string")) {
    return NextResponse.json({ error: "alertIds must be a non-empty array of alert ids" }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const eligible = await prisma.alert.findMany({
    where: { id: { in: alertIds }, assetId, status: { in: ["open", "in_progress"] }, fixedVersion: null },
    select: { id: true, status: true },
  })

  const userName = session.user?.name ?? session.user?.email ?? "Unknown"
  const reason = memo || DEFAULT_REASON
  if (eligible.length > 0) {
    await prisma.$transaction([
      prisma.alert.updateMany({
        where: { id: { in: eligible.map((a) => a.id) } },
        data: { status: "ignored", ignoreReason: "accepted_risk", vexJustification: null, resolvedAt: null, reopenOnFix: true },
      }),
      prisma.alertEvent.createMany({
        data: eligible.map((a) => ({
          alertId: a.id,
          type: "status_changed",
          data: { from: a.status, to: "ignored", ignoreReason: "accepted_risk", reason, userName },
        })),
      }),
    ])
    await createAuditLog({
      userId: session.user?.id ?? null,
      userEmail: session.user?.email ?? null,
      action: "alerts_accepted",
      target: asset.name || asset.hostname,
      detail: `${eligible.length} no-fix alerts accepted until a fix exists`,
    })
  }

  return NextResponse.json({ accepted: eligible.length, skipped: alertIds.length - eligible.length })
})
