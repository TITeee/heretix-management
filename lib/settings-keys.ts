/**
 * The keys the Settings page saves through PATCH /api/settings. Anything else
 * is refused, so the endpoint cannot be used to write the app's internal rows
 * (sla_config, METADATA_REFRESH_STATUS) or keys nothing reads.
 */
export const EDITABLE_SETTING_KEYS = new Set([
  "HERETIX_API_URL",
  "HERETIX_API_KEY",
  "SLACK_ENABLED",
  "SLACK_WEBHOOK_URL",
  "SLACK_MIN_SEVERITY",
  "SLACK_FILTER_TYPE",
  "SLACK_TAG_IDS",
  "AI_ENABLED",
  "AI_API_KEY",
  "AI_MODEL",
])

/**
 * Settings that are credentials (a Slack webhook URL is one: it posts to the
 * channel). They are sent to the browser masked, so the page cannot hand them
 * to anything that reads it; the page sends the mask back for one left as it
 * was, which keeps the stored value.
 */
export const SECRET_SETTING_KEYS = new Set(["HERETIX_API_KEY", "SLACK_WEBHOOK_URL", "AI_API_KEY"])

const MASK = "••••"

/** `value` with all but its last 4 characters hidden; a short one is hidden whole. */
export function maskSecret(value: string): string {
  if (value === "") return ""
  return value.length > 8 ? MASK + value.slice(-4) : MASK
}

/** Whether `value` is a mask from maskSecret, sent back unchanged. */
export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(MASK)
}
