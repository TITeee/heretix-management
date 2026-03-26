import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

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

  const versionChanged = version !== undefined && version !== pkg.version

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

  // Auto-resolve open/in_progress alerts when version changes
  if (versionChanged) {
    const oldVersion = pkg.version
    const resolveReason = `Package version changed: ${oldVersion} → ${version}`
    const alerts = await prisma.alert.findMany({
      where: {
        assetId: pkg.assetId,
        packageName: pkg.name,
        packageVersion: oldVersion,
        ecosystem: pkg.ecosystem,
        status: { in: ["open", "in_progress"] },
      },
    })
    for (const alert of alerts) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: "resolved", resolvedAt: new Date(), resolveReason },
      })
      await prisma.alertEvent.create({
        data: {
          alertId: alert.id,
          type: "status_changed",
          data: { from: alert.status, to: "resolved", reason: resolveReason },
        },
      })
    }
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

  await prisma.package.delete({ where: { id: pkgId } })
  return new NextResponse(null, { status: 204 })
}
