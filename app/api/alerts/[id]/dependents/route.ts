import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { buildDependents } from "@/lib/dependents"

/**
 * What brings the alert's package into its asset: the entry points above it, each with
 * one shortest path down to it (lib/dependents.ts). Also what the tab links on with: the
 * asset, whether it has a Services tab, and how many services had the package loaded.
 */
export const GET = withApiErrorHandling("alerts.dependents", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const alert = await prisma.alert.findUnique({
    where: { id },
    select: { assetId: true, packageName: true, packageVersion: true, ecosystem: true },
  })
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [packages, openAlerts] = await Promise.all([
    prisma.package.findMany({
      where: { assetId: alert.assetId },
      select: {
        name: true, version: true, ecosystem: true, direct: true, deps: true,
        sourcePackage: true, scope: true, category: true, inUse: true, usedBy: true,
      },
    }),
    prisma.alert.findMany({
      where: { assetId: alert.assetId, status: { in: ["open", "in_progress"] } },
      select: { packageName: true, packageVersion: true },
      distinct: ["packageName", "packageVersion"],
    }),
  ])

  const vulnerable = new Set(openAlerts.map((a) => `${a.packageName}\u0000${a.packageVersion}`))
  const data = buildDependents(
    packages,
    { name: alert.packageName, version: alert.packageVersion, ecosystem: alert.ecosystem },
    vulnerable,
  )
  const targetPkg = packages.find((p) => p.name === alert.packageName && p.version === alert.packageVersion)

  return NextResponse.json({
    ...data,
    assetId: alert.assetId,
    hasRuntimeFacts: packages.some((p) => p.inUse !== null),
    loadedBy: targetPkg?.usedBy.length ?? 0,
  })
})
