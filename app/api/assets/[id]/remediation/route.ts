import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { buildRemediationPlan } from "@/lib/remediation"

/**
 * The asset's open and in-progress alerts grouped into remediation actions and
 * no-fix groups (see lib/remediation.ts), plus the alerts themselves so the
 * page can list each group's findings and open one in the alert sheet.
 *
 * acceptedWithFix groups, the same way, the alerts ignored as accepted risk
 * that now have a fixed version. They are only pointed out: an acceptance made
 * by hand may rest on more than the missing fix, so it is never reopened
 * automatically (unlike one made with reopenOnFix, which a scan reopens).
 */
export const GET = withApiErrorHandling("assets.remediation", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const include = { asset: { select: { id: true, name: true, hostname: true } } }
  const [alerts, accepted, packages] = await Promise.all([
    prisma.alert.findMany({
      where: { assetId: id, status: { in: ["open", "in_progress"] } },
      include,
    }),
    prisma.alert.findMany({
      where: { assetId: id, status: "ignored", ignoreReason: "accepted_risk", fixedVersion: { not: null } },
      include,
    }),
    prisma.package.findMany({
      where: { assetId: id },
      select: { name: true, version: true, ecosystem: true, direct: true, deps: true, source: true },
    }),
  ])

  return NextResponse.json({
    plan: buildRemediationPlan(alerts, packages),
    acceptedWithFix: buildRemediationPlan(accepted, packages).actions,
    alerts: [...alerts, ...accepted],
  })
})
