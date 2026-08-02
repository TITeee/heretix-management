import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { callAnthropic, AIError } from "@/lib/ai"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { apiKey, model } = await req.json()
  if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 })

  try {
    await callAnthropic({
      apiKey,
      model: model || "claude-sonnet-4-5-20250929",
      system: "Reply with exactly one word: OK",
      messages: [{ role: "user", content: "ping" }],
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err instanceof AIError ? err.status : 502
    const message = err instanceof Error ? err.message : "Connection failed"
    return NextResponse.json({ error: message }, { status })
  }
}
