import { prisma } from "@/lib/db"

import { DEFAULT_AI_MODEL } from "@/lib/ai-models"

const DEFAULT_MODEL = DEFAULT_AI_MODEL

export type AIConfig = {
  enabled: boolean
  apiKey: string | null
  model: string
  /** One of AI_LANGUAGES, or "" for the language the user writes in. */
  language: string
}

export async function getAIConfig(): Promise<AIConfig> {
  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "AI_" } },
  })
  const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return {
    enabled: cfg.AI_ENABLED === "true",
    apiKey: cfg.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null,
    model: cfg.AI_MODEL || DEFAULT_MODEL,
    language: cfg.AI_LANGUAGE || "",
  }
}

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export class AIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function callAnthropic(params: {
  apiKey: string
  model: string
  system: string
  messages: ChatMessage[]
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 1024,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new AIError(res.status, `Anthropic API error: ${res.status} ${text}`)
  }

  const data = await res.json()
  const text = data.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text
  if (!text) throw new AIError(502, "Anthropic API returned no text content")
  return text
}
