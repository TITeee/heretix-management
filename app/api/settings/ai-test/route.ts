import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { callAnthropic, AIError } from "@/lib/ai"
import { withApiErrorHandling } from "@/lib/api-handler"
import { readJsonBody } from "@/lib/request-body"
import { secretOrStored } from "@/lib/settings-store"

export const POST = withApiErrorHandling("settings.aiTest", async (req: NextRequest) => {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { apiKey: sentKey, model } = (await readJsonBody(req)) as { apiKey?: unknown; model?: unknown }
  const apiKey = await secretOrStored("AI_API_KEY", sentKey)
  if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 })

  try {
    await callAnthropic({
      apiKey,
      model: typeof model === "string" && model ? model : "claude-sonnet-4-5-20250929",
      system: "Reply with exactly one word: OK",
      messages: [{ role: "user", content: "ping" }],
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err instanceof AIError ? err.status : 502
    const message = err instanceof Error ? err.message : "Connection failed"
    return NextResponse.json({ error: message }, { status })
  }
})
