import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshRunningSince, runRefresh } from "@/lib/refresh-run"
import { withApiErrorHandling } from "@/lib/api-handler"
import { demoModeBlocked } from "@/lib/demo-mode"

export const POST = withApiErrorHandling("alerts.refresh", async () => {
  const blocked = demoModeBlocked()
  if (blocked) return blocked
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await runRefresh()
  if (!result) {
    const since = refreshRunningSince()
    return NextResponse.json(
      {
        error: since
          ? `A metadata refresh is already running (started ${since.toISOString().slice(11, 16)} UTC). Its changes appear when it finishes.`
          : "A metadata refresh is already running.",
      },
      { status: 409 }
    )
  }
  return NextResponse.json({ updated: result.updated, failed: result.failed })
})
