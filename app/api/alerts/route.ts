import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get("assetId")
  const packageName = searchParams.get("packageName")
  const packageVersion = searchParams.get("packageVersion")

  const alerts = await prisma.alert.findMany({
    where: {
      ...(assetId ? { assetId } : {}),
      ...(packageName ? { packageName } : {}),
      ...(packageVersion ? { packageVersion } : {}),
    },
    select: {
      id: true, assetId: true, packageName: true, packageVersion: true,
      ecosystem: true, externalId: true, sources: true,
      cvssScore: true, cvssVector: true, summary: true,
      isKev: true, epssScore: true, epssPercentile: true,
      status: true, notes: true, resolveReason: true,
      vexJustification: true, ignoreReason: true, fixedVersion: true,
      detectedAt: true, resolvedAt: true,
      asset: { select: { id: true, name: true, hostname: true } },
    },
    orderBy: [{ cvssScore: "desc" }, { detectedAt: "desc" }],
  })

  return NextResponse.json(alerts)
}
