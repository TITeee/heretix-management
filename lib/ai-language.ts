/**
 * The languages AI Insight can be told to reply in. The value is what is stored in
 * the AI_LANGUAGE setting and also the name given to the model; "" means no
 * preference, so the model follows the language the user writes in.
 */
export const AI_LANGUAGES = ["English", "Japanese", "Chinese", "Korean", "Spanish", "French", "German"] as const

/** The label shown for a language, in that language. */
export const AI_LANGUAGE_LABELS: Record<(typeof AI_LANGUAGES)[number], string> = {
  English: "English",
  Japanese: "日本語",
  Chinese: "中文",
  Korean: "한국어",
  Spanish: "Español",
  French: "Français",
  German: "Deutsch",
}

export function isAiLanguage(value: unknown): value is (typeof AI_LANGUAGES)[number] {
  return typeof value === "string" && (AI_LANGUAGES as readonly string[]).includes(value)
}

/**
 * The sentence added to the system prompt for the chosen language, or "" for none.
 * A stored value that is not a listed language is ignored, so it can never put free
 * text into the prompt.
 */
export function languageInstruction(language: string | null | undefined): string {
  if (!isAiLanguage(language)) return ""
  return `Reply in ${language}, including the first analysis, unless the user writes in another language.`
}
