import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim()
  const limit = parseInt(searchParams.get("limit") ?? "10")

  if (!search) return NextResponse.json([])

  const [exact, partial] = await Promise.all([
    prisma.package.findMany({
      where: { name: { equals: search, mode: "insensitive" } },
      select: { name: true, ecosystem: true },
      distinct: ["name"],
    }),
    prisma.package.findMany({
      where: {
        name: { contains: search, mode: "insensitive" },
        NOT: { name: { equals: search, mode: "insensitive" } },
      },
      select: { name: true, ecosystem: true },
      distinct: ["name"],
      take: limit,
      orderBy: { name: "asc" },
    }),
  ])

  const seen = new Set(exact.map((r) => r.name))
  const rows = [...exact, ...partial.filter((r) => !seen.has(r.name))].slice(0, limit)

  return NextResponse.json(rows)
}
