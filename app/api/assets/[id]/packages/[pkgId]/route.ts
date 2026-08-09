import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { scanAsset } from "@/lib/scan"
import { carryForwardAlerts } from "@/lib/alerts"
import { logger } from "@/lib/logger"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pkgId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { pkgId } = await params
  const { name, version, ecosystem, location, cpe } = await req.json()

  const pkg = await prisma.package.findUnique({ where: { id: pkgId } })
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const next = {
    name: name ?? pkg.name,
    version: version ?? pkg.version,
    ecosystem: ecosystem ?? pkg.ecosystem,
  }
  const identityChanged =
    next.name !== pkg.name || next.version !== pkg.version || next.ecosystem !== pkg.ecosystem

  if (identityChanged) {
    const clash = await prisma.package.findFirst({
      where: { assetId: pkg.assetId, ...next, id: { not: pkg.id } },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json(
        { error: `${next.name} ${next.version} is already registered on this asset` },
        { status: 409 }
      )
    }
  }

  const updated = await prisma.package.update({
    where: { id: pkgId },
    data: {
      ...(name !== undefined && { name }),
      ...(version !== undefined && { version, rawVersion: version }),
      ...(ecosystem !== undefined && { ecosystem }),
      ...(location !== undefined && { location: location || null }),
      ...(cpe !== undefined && { cpe: cpe || null }),
    },
  })

  if (!identityChanged) return NextResponse.json(updated)

  await carryForwardAlerts(
    { assetId: pkg.assetId, name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem },
    { assetId: pkg.assetId, ...next }
  )

  // Ask heretix-api whether the package is still affected. Findings that survive the
  // edit are matched to the carried rows and left untouched; the ones that are fixed
  // are closed by the scan's reconciliation. Deciding that here from the version
  // strings alone would mean guessing, and a wrong guess silently hides a real finding.
  try {
    await scanAsset(pkg.assetId)
  } catch (err) {
    const scanError = err instanceof Error ? err.message : "Unknown error"
    logger.warn("rescan after package edit failed", { assetId: pkg.assetId, pkgId, error: scanError })
    // The package edit itself stands; the alerts simply keep the state they had.
    return NextResponse.json({ ...updated, scanError })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pkgId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { pkgId } = await params

  const pkg = await prisma.package.findUnique({ where: { id: pkgId } })
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.alert.deleteMany({
    where: { assetId: pkg.assetId, packageName: pkg.name, packageVersion: pkg.version },
  })
  await prisma.package.delete({ where: { id: pkgId } })
  return new NextResponse(null, { status: 204 })
}
