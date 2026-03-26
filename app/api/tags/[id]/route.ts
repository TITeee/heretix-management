import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

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
  if (tag.type === "asset") {
    const assetIds = tag.assetTags.map(at => at.assetId)
    const alerts = await prisma.alert.groupBy({
      by: ["severity"],
      where: { assetId: { in: assetIds }, status: { not: "resolved" } },
      _count: { id: true },
    })
    alertSummary = Object.fromEntries(alerts.map(a => [a.severity ?? "UNKNOWN", a._count.id]))
  } else {
    const packageNames = tag.packageTags.map(pt => pt.packageName)
    const alerts = await prisma.alert.groupBy({
      by: ["severity"],
      where: { packageName: { in: packageNames }, status: { not: "resolved" } },
      _count: { id: true },
    })
    alertSummary = Object.fromEntries(alerts.map(a => [a.severity ?? "UNKNOWN", a._count.id]))
  }

  // Open alert counts per asset
  let assetAlertCounts: Record<string, number> = {}
  if (tag.type === "asset") {
    const counts = await prisma.alert.groupBy({
      by: ["assetId"],
      where: { assetId: { in: tag.assetTags.map(at => at.assetId) }, status: { not: "resolved" } },
      _count: { id: true },
    })
    assetAlertCounts = Object.fromEntries(counts.map(c => [c.assetId, c._count.id]))
  }

  return NextResponse.json({ ...tag, alertSummary, assetAlertCounts })
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
