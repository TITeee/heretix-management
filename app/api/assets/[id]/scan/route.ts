import { NextRequest, NextResponse } from "next/server"
import { authenticate } from "@/lib/api-auth"
import { auditIdentity } from "@/lib/api-token"
import { scanAsset } from "@/lib/scan"
import { prisma } from "@/lib/db"
import { createAuditLog } from "@/lib/audit"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticate(req, ["scan"])
  if ("response" in authResult) return authResult.response

  const { id: assetId } = await params

  try {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true } })
    const { newAlerts, resolvedAlerts } = await scanAsset(assetId)
    await createAuditLog({
      ...auditIdentity(authResult.actor),
      action: "asset_scanned", target: asset?.name || asset?.hostname,
      detail: `new alerts: ${newAlerts}, resolved: ${resolvedAlerts}`,
    })
    return NextResponse.json({ newAlerts, resolvedAlerts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (msg.includes("Asset not found")) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
