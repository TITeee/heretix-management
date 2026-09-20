import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshMetadata } from "@/lib/refresh"
import { withApiErrorHandling } from "@/lib/api-handler"

export const POST = withApiErrorHandling("alerts.refresh", async () => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { updated, failed } = await refreshMetadata()
  return NextResponse.json({ updated, failed })
})
