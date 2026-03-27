import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100)
  const offset = parseInt(searchParams.get("offset") ?? "0")

  const [runs, total] = await Promise.all([
    prisma.metadataRefreshRun.findMany({
      orderBy: { executedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        alertEvents: {
          include: {
            alert: {
              select: {
                externalId: true,
                packageName: true,
                packageVersion: true,
                asset: { select: { name: true, hostname: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.metadataRefreshRun.count(),
  ])

  return NextResponse.json({ runs, total })
}
