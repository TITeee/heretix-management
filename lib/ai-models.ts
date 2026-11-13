/** The Claude models offered in Settings → AI, cheapest first. Any other model ID can be typed in. */
export const AI_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "low cost" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "lowest cost" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", note: "default" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "balanced" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "high capability" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", note: "most capable" },
] as const

export const DEFAULT_AI_MODEL = "claude-sonnet-4-5-20250929"

/** Whether `id` is one of the listed models. */
export function isListedAiModel(id: string): boolean {
  return AI_MODELS.some((m) => m.id === id)
}
