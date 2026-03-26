import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const asset = await prisma.asset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { name, version, rawVersion, ecosystem, source, location, cpe } = await req.json()
  if (!name || !version) {
    return NextResponse.json({ error: "name and version are required" }, { status: 400 })
  }

  const pkg = await prisma.package.create({
    data: {
      assetId: id,
      name,
      version,
      rawVersion: rawVersion ?? version,
      ecosystem,
      source: source ?? "manual",
      location: location ?? null,
      cpe: cpe ?? null,
    },
  })

  await prisma.packageHistory.create({
    data: {
      assetId: id,
      packageName: name,
      ecosystem,
      action: "added",
      newVersion: version,
    },
  })

  return NextResponse.json(pkg, { status: 201 })
}
