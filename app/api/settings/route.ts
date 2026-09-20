import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"

// Keys any signed-in user may read — a non-admin only needs the AI Insight
// feature flag (checked from the alert detail panel); everything else here
// is either a secret (API keys, the Slack webhook URL) or admin-only config.
const NON_ADMIN_READABLE_KEYS = new Set(["AI_ENABLED"])

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const settings = await prisma.setting.findMany()
  const isAdmin = session.user?.role === "admin"
  const map = Object.fromEntries(
    settings
      .filter((s) => isAdmin || NON_ADMIN_READABLE_KEYS.has(s.key))
      .map((s) => [s.key, s.value])
  )
  return NextResponse.json(map)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const updates = Object.entries(body as Record<string, string>)

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  )

  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: "settings_updated",
    detail: updates.map(([k]) => k).join(", "),
  })

  return NextResponse.json({ ok: true })
}
