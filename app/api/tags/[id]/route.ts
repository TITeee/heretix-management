import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { buildAlertSummary } from "@/components/alerts/alert-summary-badges"
import { countSeverityByKey, type SeverityCounts } from "@/lib/severity"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const tag = await prisma.tag.findUnique({
    where: { id },
    include: {
      assetTags: { include: { asset: { select: { id: true, name: true, hostname: true, assetType: true } } } },
      packageTags: true,
    },
  })
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Alert aggregation
  let alertSummary: Record<string, number> = {}
  let kevCount = 0
  if (tag.type === "asset") {
    const assetIds = tag.assetTags.map(at => at.assetId)
    const alerts = await prisma.alert.groupBy({
      by: ["severity", "cvssScore"],
      where: { assetId: { in: assetIds }, status: { in: ["open", "in_progress"] } },
      _count: { id: true },
    })
    alertSummary = buildAlertSummary(alerts)
    kevCount = await prisma.alert.count({
      where: { assetId: { in: assetIds }, status: { in: ["open", "in_progress"] }, isKev: true },
    })
  } else {
    const packageNames = tag.packageTags.map(pt => pt.packageName)
    const alerts = await prisma.alert.groupBy({
      by: ["severity", "cvssScore"],
      where: { packageName: { in: packageNames }, status: { in: ["open", "in_progress"] } },
      _count: { id: true },
    })
    alertSummary = buildAlertSummary(alerts)
    kevCount = await prisma.alert.count({
      where: { packageName: { in: packageNames }, status: { in: ["open", "in_progress"] }, isKev: true },
    })
  }

  // Open alerts per asset, split by severity tier. Tiered the same way as
  // alertSummary above, so a tag's per-asset badges add up to its summary.
  let assetAlertSeverities: Record<string, SeverityCounts> = {}
  if (tag.type === "asset") {
    const openAlerts = await prisma.alert.findMany({
      where: { assetId: { in: tag.assetTags.map(at => at.assetId) }, status: { in: ["open", "in_progress"] } },
      select: { assetId: true, severity: true, cvssScore: true },
    })
    assetAlertSeverities = Object.fromEntries(countSeverityByKey(openAlerts, a => a.assetId))
  }

  // Open alerts per package name, split by severity tier (same rule as above)
  let packageAlertSeverities: Record<string, SeverityCounts> = {}
  // Ecosystem per package name (first match)
  let packageEcosystems: Record<string, string> = {}
  if (tag.type === "package") {
    const packageNames = tag.packageTags.map(pt => pt.packageName)
    const openAlerts = await prisma.alert.findMany({
      where: { packageName: { in: packageNames }, status: { in: ["open", "in_progress"] } },
      select: { packageName: true, severity: true, cvssScore: true },
    })
    packageAlertSeverities = Object.fromEntries(countSeverityByKey(openAlerts, a => a.packageName))

    const pkgs = await prisma.package.findMany({
      where: { name: { in: packageNames } },
      select: { name: true, ecosystem: true },
      distinct: ["name"],
    })
    packageEcosystems = Object.fromEntries(pkgs.map(p => [p.name, p.ecosystem ?? ""]))
  }

  return NextResponse.json({ ...tag, alertSummary, kevCount, assetAlertSeverities, packageAlertSeverities, packageEcosystems })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const existing = await prisma.tag.findUnique({ where: { id }, select: { isDefault: true } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.isDefault) return NextResponse.json({ error: "Default tags cannot be modified" }, { status: 403 })

  const { name, color, description } = await req.json()

  try {
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(description !== undefined && { description }),
      },
    })
    return NextResponse.json(tag)
  } catch {
    return NextResponse.json({ error: "Tag name already exists" }, { status: 409 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const tag = await prisma.tag.findUnique({ where: { id }, select: { isDefault: true } })
  if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tag.isDefault) return NextResponse.json({ error: "Default tags cannot be deleted" }, { status: 403 })

  await prisma.tag.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
