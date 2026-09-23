import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"

export const GET = withApiErrorHandling("assets.get", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
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
})

export const PATCH = withApiErrorHandling("assets.update", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name, hostname, osName, osId, osVersionId } = await req.json()

  // hostname is @unique — renaming it to collide with another asset now
  // surfaces as a clean 409 via withApiErrorHandling's P2002 handling instead
  // of silently succeeding (the previous behavior) or a raw 500.
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
})

export const DELETE = withApiErrorHandling("assets.delete", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.asset.findUnique({ where: { id }, select: { name: true, hostname: true } })
  await prisma.asset.delete({ where: { id } })
  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: "asset_deleted", target: target?.name || target?.hostname,
  })
  return new NextResponse(null, { status: 204 })
})
