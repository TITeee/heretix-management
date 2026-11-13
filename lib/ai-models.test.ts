import { describe, it, expect } from "vitest"
import { AI_MODELS, DEFAULT_AI_MODEL, isListedAiModel } from "./ai-models"

describe("AI models", () => {
  it("lists the default model", () => {
    expect(isListedAiModel(DEFAULT_AI_MODEL)).toBe(true)
  })

  it("does not list an ID typed in by hand", () => {
    expect(isListedAiModel("claude-something-else")).toBe(false)
    expect(isListedAiModel("")).toBe(false)
  })

  it("has no duplicate IDs", () => {
    expect(new Set(AI_MODELS.map((m) => m.id)).size).toBe(AI_MODELS.length)
  })
})
