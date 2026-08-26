import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { suggestPackageNames } from "@/lib/heretix-api"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q) return NextResponse.json({ suggestions: [] })

  try {
    const suggestions = await suggestPackageNames({
      q,
      ecosystem: searchParams.get("ecosystem") ?? undefined,
    })
    return NextResponse.json({ suggestions })
  } catch {
    // Suggestions are a convenience, not the search itself — fail quietly
    // rather than surfacing an error banner for an autocomplete dropdown.
    return NextResponse.json({ suggestions: [] })
  }
}
