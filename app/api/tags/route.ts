import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tags = await prisma.tag.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { assetTags: true, packageTags: true } },
    },
  })
  return NextResponse.json(tags)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, type, color, description } = await req.json()
  if (!name || !type) return NextResponse.json({ error: "name and type are required" }, { status: 400 })
  if (type !== "asset" && type !== "package") return NextResponse.json({ error: "type must be asset or package" }, { status: 400 })

  try {
    const tag = await prisma.tag.create({ data: { name, type, color: color ?? null, description: description ?? null } })
    return NextResponse.json(tag, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Tag name already exists" }, { status: 409 })
  }
}
