import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { createAuditLog } from "@/lib/audit"
import { noFixWhere } from "@/lib/remediation-data"

const DEFAULT_REASON = "No fix available: accepted until one is"

// A group can hold tens of thousands of alerts; written in slices so no statement
// carries more than a database accepts in one go.
const CHUNK = 5_000

/**
 * Accepts a group of the asset's no-fix findings at once (Remediation view):
 * each becomes ignored with reason accepted_risk and reopenOnFix, so the next
 * scan that finds a fixed version reopens it. Only open or in-progress alerts
 * of this asset that have no fixedVersion are touched; any other id is skipped
 * and reported back, so a stale page can't accept a finding that has since
 * gained a fix.
 *
 * The group is named either by `groupKey` (the no-fix group's key from the plan: the
 * distro's fix status, "" for none given), which accepts what the group holds now, or by
 * `alertIds`.
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
  const groupKey: unknown = body?.groupKey
  const memo = typeof body?.memo === "string" ? body.memo.trim() : ""
  const byGroup = typeof groupKey === "string"
  if (!byGroup && (!Array.isArray(alertIds) || alertIds.length === 0 || !alertIds.every((a) => typeof a === "string"))) {
    return NextResponse.json({ error: "alertIds must be a non-empty array of alert ids, or groupKey a no-fix group's key" }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const eligible = await prisma.alert.findMany({
    where: byGroup
      ? { assetId, ...noFixWhere(groupKey) }
      : { id: { in: alertIds as string[] }, assetId, status: { in: ["open", "in_progress"] }, fixedVersion: null },
    select: { id: true, status: true },
  })

  const userName = session.user?.name ?? session.user?.email ?? "Unknown"
  const reason = memo || DEFAULT_REASON
  for (let i = 0; i < eligible.length; i += CHUNK) {
    const slice = eligible.slice(i, i + CHUNK)
    await prisma.$transaction([
      prisma.alert.updateMany({
        where: { id: { in: slice.map((a) => a.id) } },
        data: { status: "ignored", ignoreReason: "accepted_risk", vexJustification: null, resolvedAt: null, reopenOnFix: true },
      }),
      prisma.alertEvent.createMany({
        data: slice.map((a) => ({
          alertId: a.id,
          type: "status_changed",
          data: { from: a.status, to: "ignored", ignoreReason: "accepted_risk", reason, userName },
        })),
      }),
    ])
  }
  if (eligible.length > 0) {
    await createAuditLog({
      userId: session.user?.id ?? null,
      userEmail: session.user?.email ?? null,
      action: "alerts_accepted",
      target: asset.name || asset.hostname,
      detail: `${eligible.length} no-fix alerts accepted until a fix exists`,
    })
  }

  return NextResponse.json({ accepted: eligible.length, skipped: byGroup ? 0 : (alertIds as string[]).length - eligible.length })
})
