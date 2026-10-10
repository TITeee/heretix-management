import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listCatalog } from "@/lib/heretix-api"

/**
 * The product catalog for the Add Package picker. `available` is false when
 * heretix-api has no catalog (an older version) or cannot be reached, so the
 * picker can step aside and the dialog keeps working as it did.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = new URL(req.url).searchParams.get("q")?.trim() || undefined
  try {
    return NextResponse.json({ available: true, entries: await listCatalog({ q }) })
  } catch {
    return NextResponse.json({ available: false, entries: [] })
  }
}
