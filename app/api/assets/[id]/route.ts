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
  const body = await req.json()

  // Only name, hostname, and (for a manually registered asset) type are
  // editable. The OS fields are not: an imported asset's are overwritten by
  // every re-import, a manual asset's hold only the "manual" marker the UI keys
  // on (osId), and neither is used in scanning.
  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: { name?: string; hostname?: string; assetType?: string } = {}
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return NextResponse.json({ error: "name must not be empty" }, { status: 400 })
    data.name = name
  }
  if (body.hostname !== undefined) {
    const hostname = typeof body.hostname === "string" ? body.hostname.trim() : ""
    if (!hostname) return NextResponse.json({ error: "hostname must not be empty" }, { status: 400 })
    // Checked up front for a specific message; the @unique constraint (a P2002
    // → 409 via withApiErrorHandling) still backs it against a race.
    if (hostname !== existing.hostname && await prisma.asset.findUnique({ where: { hostname } })) {
      return NextResponse.json({ error: "Hostname already exists" }, { status: 409 })
    }
    data.hostname = hostname
  }
  if (body.assetType !== undefined) {
    if (existing.osId !== "manual") {
      return NextResponse.json({ error: "Type can only be changed on a manually registered asset" }, { status: 400 })
    }
    if (body.assetType !== "host" && body.assetType !== "docker_image") {
      return NextResponse.json({ error: "assetType must be host or docker_image" }, { status: 400 })
    }
    data.assetType = body.assetType
  }

  const asset = await prisma.asset.update({ where: { id }, data })

  // Hostname is the key imports (and CI's ?hostname=) match on, so a change to
  // it is recorded with both values.
  const changes = (Object.keys(data) as (keyof typeof data)[])
    .filter((k) => existing[k] !== data[k])
    .map((k) => `${k}: ${existing[k]} → ${data[k]}`)
  if (changes.length) {
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "asset_updated", target: asset.name || asset.hostname,
      detail: changes.join(", "),
    })
  }
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
