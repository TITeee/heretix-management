import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { testSlackWebhook } from "@/lib/slack"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 })

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") throw new Error()
  } catch {
    return NextResponse.json({ error: "Invalid URL: must be a valid https URL" }, { status: 400 })
  }

  try {
    await testSlackWebhook(url)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
