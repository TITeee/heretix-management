import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { logger } from "@/lib/logger"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      packages: { orderBy: [{ ecosystem: "asc" }, { name: "asc" }] },
      scanJobs: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { alerts: { where: { status: { in: ["open", "in_progress"] } } } } },
    },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(asset)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name, hostname, osName, osId, osVersionId } = await req.json()

  try {
    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(hostname !== undefined && { hostname }),
        ...(osName !== undefined && { osName }),
        ...(osId !== undefined && { osId }),
        ...(osVersionId !== undefined && { osVersionId }),
      },
    })
    return NextResponse.json(asset)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    logger.warn("failed to update asset", { assetId: id, error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    const target = await prisma.asset.findUnique({ where: { id }, select: { name: true, hostname: true } })
    await prisma.asset.delete({ where: { id } })
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "asset_deleted", target: target?.name || target?.hostname,
    })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    logger.warn("failed to delete asset", { assetId: id, error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 })
  }
}
