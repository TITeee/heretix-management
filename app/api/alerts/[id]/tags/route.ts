import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"

const TAG_FIELDS = { id: true, name: true, color: true, description: true } as const

/**
 * The tags an alert falls under: the asset tags on its asset, and the package
 * tags on its package name (package tags are keyed by name alone, so they
 * cover every version and ecosystem).
 */
export const GET = withApiErrorHandling("alerts.tags", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const alert = await prisma.alert.findUnique({ where: { id }, select: { assetId: true, packageName: true } })
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 })

  const [assetTags, packageTags] = await Promise.all([
    prisma.assetTag.findMany({ where: { assetId: alert.assetId }, select: { tag: { select: TAG_FIELDS } } }),
    prisma.packageTag.findMany({ where: { packageName: alert.packageName }, select: { tag: { select: TAG_FIELDS } } }),
  ])
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

  return NextResponse.json({
    assetTags: assetTags.map((t) => t.tag).sort(byName),
    packageTags: packageTags.map((t) => t.tag).sort(byName),
  })
})
