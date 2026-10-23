import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { summarizeGroup, summarizePlan } from "@/lib/remediation"
import { loadRemediation } from "@/lib/remediation-data"

/**
 * The asset's open and in-progress alerts grouped into remediation actions and
 * no-fix groups (see lib/remediation.ts), as counts only. The alerts inside a
 * group are read a page at a time from ./alerts: a group can hold tens of
 * thousands of them.
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

  const { plan, acceptedWithFix } = await loadRemediation(id)
  return NextResponse.json({
    plan: summarizePlan(plan),
    acceptedWithFix: acceptedWithFix.map(summarizeGroup),
  })
})
