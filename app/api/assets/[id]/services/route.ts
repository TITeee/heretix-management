import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { buildServicesView } from "@/lib/services-view"

/**
 * The asset's open and in-progress findings by the services that had their packages
 * loaded when heretix-cli collected the asset (see lib/services-view.ts). Only an asset
 * whose SBOM carries heretix-cli's runtime facts has any; for another, the view is empty.
 */
export const GET = withApiErrorHandling("assets.services", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, sbomTool: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const [packages, alerts] = await Promise.all([
    prisma.package.findMany({
      where: { assetId: id },
      select: {
        name: true, version: true, ecosystem: true, sourcePackage: true,
        inUse: true, usedBy: true, needsRestart: true, restartNeededBy: true,
      },
    }),
    prisma.alert.findMany({
      where: { assetId: id, status: { in: ["open", "in_progress"] } },
      select: { packageName: true, packageVersion: true, externalId: true, severity: true, cvssScore: true, isKev: true, fixedVersion: true },
    }),
  ])

  return NextResponse.json({ sbomTool: asset.sbomTool, ...buildServicesView(packages, alerts) })
})
