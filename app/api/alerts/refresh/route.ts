import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshMetadata } from "@/lib/refresh"
import { withApiErrorHandling } from "@/lib/api-handler"
import { demoModeBlocked } from "@/lib/demo-mode"

export const POST = withApiErrorHandling("alerts.refresh", async () => {
  const blocked = demoModeBlocked()
  if (blocked) return blocked
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { updated, failed } = await refreshMetadata()
  return NextResponse.json({ updated, failed })
})
