import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { REMEDIATION_SECTIONS, type RemediationSection } from "@/lib/remediation"
import { groupAlertIds } from "@/lib/remediation-data"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function count(value: string | null, fallback: number, max: number): number {
  if (value === null) return fallback
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback
}

/**
 * A slice of one Remediation group's alerts, most urgent first (KEV, severity tier, CVSS).
 *   section  actions | noFix | accepted   which list the group is in
 *   key      the group's key, as the plan returns it
 *   offset   how many to skip (default 0)
 *   limit    how many to return (default 100, at most 500)
 * Returns { total, alerts }. A group that no longer exists (its alerts were all dealt with
 * since the plan was loaded) is 404, so the page reloads the plan.
 */
export const GET = withApiErrorHandling("assets.remediation.alerts", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const query = req.nextUrl.searchParams
  const section = query.get("section") as RemediationSection | null
  const key = query.get("key")
  if (!section || !REMEDIATION_SECTIONS.includes(section) || key === null) {
    return NextResponse.json({ error: "section (actions, noFix or accepted) and key are required" }, { status: 400 })
  }
  const offset = count(query.get("offset"), 0, Number.MAX_SAFE_INTEGER)
  const limit = count(query.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)

  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const ids = await groupAlertIds(id, section, key)
  if (!ids) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const pageIds = ids.slice(offset, offset + limit)
  const rows = await prisma.alert.findMany({
    where: { id: { in: pageIds }, assetId: id },
    include: { asset: { select: { id: true, name: true, hostname: true } } },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  return NextResponse.json({
    total: ids.length,
    alerts: pageIds.map((alertId) => byId.get(alertId)).filter((r) => r !== undefined),
  })
})
