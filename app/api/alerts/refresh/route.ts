import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshMetadata } from "@/lib/refresh"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { updated } = await refreshMetadata()
  return NextResponse.json({ updated })
}
