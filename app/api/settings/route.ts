import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"
import { readJsonBody } from "@/lib/request-body"
import { EDITABLE_SETTING_KEYS, SECRET_SETTING_KEYS, isMaskedSecret, maskSecret } from "@/lib/settings-keys"
import { assertPublicHttpUrl } from "@/lib/url-guard"

// Keys any signed-in user may read — a non-admin only needs the AI Insight
// feature flag (checked from the alert detail panel); everything else here
// is either a secret (API keys, the Slack webhook URL) or admin-only config.
const NON_ADMIN_READABLE_KEYS = new Set(["AI_ENABLED"])

const MAX_VALUE_LENGTH = 4096

export const GET = withApiErrorHandling("settings.get", async () => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const settings = await prisma.setting.findMany()
  const isAdmin = session.user?.role === "admin"
  const map = Object.fromEntries(
    settings
      .filter((s) => isAdmin || NON_ADMIN_READABLE_KEYS.has(s.key))
      // Even an admin's page gets secrets masked: once saved, they are only used here.
      .map((s) => [s.key, SECRET_SETTING_KEYS.has(s.key) ? maskSecret(s.value) : s.value])
  )
  return NextResponse.json(map)
})

// What is wrong with a URL setting's value, or null. The connection tests
// checked these, but saving did not, so a value never tested was used as is.
async function urlProblem(key: string, value: string): Promise<string | null> {
  if (key === "HERETIX_API_URL" || (key === "SLACK_WEBHOOK_URL" && value !== "")) {
    if (key === "SLACK_WEBHOOK_URL" && !value.startsWith("https://")) {
      return "SLACK_WEBHOOK_URL must be an https URL"
    }
    try {
      await assertPublicHttpUrl(value)
    } catch (err) {
      return `${key}: ${err instanceof Error ? err.message : "Invalid URL"}`
    }
  }
  return null
}

export const PATCH = withApiErrorHandling("settings.update", async (req: NextRequest) => {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await readJsonBody(req)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be an object of setting keys" }, { status: 400 })
  }
  const updates: [string, string][] = []
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_SETTING_KEYS.has(key)) {
      return NextResponse.json({ error: `Unknown setting: ${key}` }, { status: 400 })
    }
    if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      return NextResponse.json({ error: `${key} must be a string of at most ${MAX_VALUE_LENGTH} characters` }, { status: 400 })
    }
    // The mask the page was given, sent back for a secret left as it was.
    if (SECRET_SETTING_KEYS.has(key) && isMaskedSecret(value)) continue
    const problem = await urlProblem(key, value)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    updates.push([key, value])
  }

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
})
