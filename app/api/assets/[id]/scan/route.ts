import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { scanAsset } from "@/lib/scan"
import { prisma } from "@/lib/db"
import { createAuditLog } from "@/lib/audit"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params

  try {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true } })
    const { newAlerts } = await scanAsset(assetId)
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "asset_scanned", target: asset?.name || asset?.hostname,
      detail: `new alerts: ${newAlerts}`,
    })
    return NextResponse.json({ newAlerts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (msg.includes("Asset not found")) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
