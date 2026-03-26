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
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      packages: { orderBy: [{ ecosystem: "asc" }, { name: "asc" }] },
      scanJobs: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { alerts: { where: { status: { not: "resolved" } } } } },
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
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await prisma.asset.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
