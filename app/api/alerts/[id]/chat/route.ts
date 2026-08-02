import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import type { Alert } from "@prisma/client"
import { getAIConfig, callAnthropic, AIError, type ChatMessage } from "@/lib/ai"

async function buildSystemPrompt(alert: Alert): Promise<string> {
  const asset = await prisma.asset.findUnique({
    where: { id: alert.assetId },
    include: { assetTags: { include: { tag: { select: { name: true } } } } },
  })
  const assetName = asset?.name || asset?.hostname || "unknown asset"
  const tags = asset?.assetTags.map((at) => at.tag.name).join(", ") || "none"

  const history = await prisma.alert.findMany({
    where: { externalId: alert.externalId, id: { not: alert.id } },
    orderBy: { resolvedAt: "desc" },
    take: 10,
    include: { asset: { select: { name: true, hostname: true } } },
  })

  const historyText = history.length === 0
    ? "No other alerts for this vulnerability exist in the system."
    : history.map((h) => {
        const otherAsset = h.asset.name || h.asset.hostname
        const parts = [`status=${h.status}`]
        if (h.resolveReason) parts.push(`reason="${h.resolveReason}"`)
        parts.push(`detected ${h.detectedAt.toISOString().slice(0, 10)}`)
        if (h.resolvedAt) parts.push(`resolved ${h.resolvedAt.toISOString().slice(0, 10)}`)
        return `- Asset "${otherAsset}": ${parts.join(", ")}`
      }).join("\n")

  return `You are a security analyst assistant embedded in a vulnerability management console. You are discussing one specific alert with a security team member. Be concise and practical.

Vulnerability: ${alert.externalId}
Package: ${alert.packageName}@${alert.packageVersion} (${alert.ecosystem})
CVSS: ${alert.cvssScore ?? "n/a"}${alert.cvssVector ? ` (${alert.cvssVector})` : ""}
Severity: ${alert.severity ?? "n/a"}
Known Exploited (CISA KEV): ${alert.isKev ? "yes" : "no"}
EPSS score: ${alert.epssScore ?? "n/a"}
Fixed version: ${alert.fixedVersion ?? "unknown"}
Summary: ${alert.summary ?? "n/a"}

Affected asset: ${assetName} (tags: ${tags})

Past handling of this same vulnerability (same ID) on other assets in this system:
${historyText}

When asked for your initial analysis, give a short plain-language explanation of why this matters for this specific asset (considering its tags and the vulnerability's severity/exploitability), then summarize the past-handling history above if any exists. For follow-up questions, answer helpfully using the context above. Do not invent facts that aren't in the context provided; say so if you don't know something.`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const messages = await prisma.alertChatMessage.findMany({
    where: { alertId: id },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(messages)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const userMessage: string | undefined = body.message

  const config = await getAIConfig()
  if (!config.enabled || !config.apiKey) {
    return NextResponse.json({ error: "AI is not configured. Set it up in Settings first." }, { status: 400 })
  }

  const alert = await prisma.alert.findUnique({ where: { id } })
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 })

  if (userMessage && userMessage.trim()) {
    await prisma.alertChatMessage.create({
      data: { alertId: id, role: "user", content: userMessage.trim() },
    })
  }

  const history = await prisma.alertChatMessage.findMany({
    where: { alertId: id },
    orderBy: { createdAt: "asc" },
  })

  const conversationMessages: ChatMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }))

  if (conversationMessages.length === 0) {
    conversationMessages.push({ role: "user", content: "Please give me your initial analysis of this vulnerability." })
  }

  try {
    const system = await buildSystemPrompt(alert)
    const reply = await callAnthropic({
      apiKey: config.apiKey,
      model: config.model,
      system,
      messages: conversationMessages,
    })
    const saved = await prisma.alertChatMessage.create({
      data: { alertId: id, role: "assistant", content: reply },
    })
    return NextResponse.json(saved)
  } catch (err) {
    const status = err instanceof AIError ? err.status : 502
    const message = err instanceof Error ? err.message : "AI request failed"
    return NextResponse.json({ error: message }, { status })
  }
}
