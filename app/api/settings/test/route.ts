import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { assertPublicHttpUrl } from "@/lib/url-guard"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { url, apiKey } = await req.json()
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 })

  try {
    await assertPublicHttpUrl(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid URL"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const headers: Record<string, string> = {}
  if (apiKey) headers["x-api-key"] = apiKey

  try {
    const res = await fetch(`${url}/api/v1/vulnerabilities/stats`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `API responded with ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Could not connect to heretix-api" }, { status: 502 })
  }
}
