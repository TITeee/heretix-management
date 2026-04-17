import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500)
  const offset = parseInt(searchParams.get("offset") ?? "0")
  const type = searchParams.get("type") ?? undefined

  const where = type ? { type } : {}

  const [events, total] = await Promise.all([
    prisma.alertEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        alert: {
          select: {
            externalId: true,
            packageName: true,
            packageVersion: true,
            asset: { select: { id: true, name: true, hostname: true } },
          },
        },
      },
    }),
    prisma.alertEvent.count({ where }),
  ])

  return NextResponse.json({ events, total })
}
