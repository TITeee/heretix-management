import { prisma } from "@/lib/db"
import { getAlertSeverityTier } from "@/lib/severity"

export type AlertSummary = {
  packageName: string
  packageVersion?: string | null
  externalId: string
  severity: string | null
  cvssScore: number | null
}

type TriggerType = "detected" | "severity_changed" | "kev_added" | "scan_held"

const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

// An alert's tier as a Slack-facing key (getAlertSeverityTier, like the rest
// of the app); N/A is UNKNOWN.
function severityKey(a: { severity: string | null; cvssScore: number | null }): string {
  const tier = getAlertSeverityTier(a.severity, a.cvssScore)
  return tier === "na" ? "UNKNOWN" : tier.toUpperCase()
}

function meetsMinSeverity(alert: AlertSummary, min: string): boolean {
  if (min === "ALL") return true
  const alertIdx = SEVERITY_ORDER.indexOf(severityKey(alert))
  if (alertIdx < 0) return false // N/A never meets a minimum
  return alertIdx >= SEVERITY_ORDER.indexOf(min.toUpperCase())
}

export async function notifySlackIfNeeded(params: {
  assetName: string
  assetTagIds: string[]
  triggerType: TriggerType
  alerts: AlertSummary[]
}): Promise<void> {
  const { assetName, assetTagIds, triggerType, alerts } = params

  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "SLACK_" } },
  })
  const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  if (cfg.SLACK_ENABLED !== "true") return
  if (!cfg.SLACK_WEBHOOK_URL) return

  // Tag filter
  if (cfg.SLACK_FILTER_TYPE === "tag") {
    let tagIds: string[] = []
    try { tagIds = JSON.parse(cfg.SLACK_TAG_IDS ?? "[]") } catch { return }
    const hasMatch = assetTagIds.some((id) => tagIds.includes(id))
    if (!hasMatch) return
  }

  // Severity filter (kev_added and scan_held bypass it: a held scan is about the
  // scan's data, whatever the severity of the alerts it kept open)
  const minSeverity = cfg.SLACK_MIN_SEVERITY ?? "ALL"
  const filtered = triggerType === "kev_added" || triggerType === "scan_held"
    ? alerts
    : alerts.filter((a) => meetsMinSeverity(a, minSeverity))

  if (filtered.length === 0) return

  const text = buildMessage(assetName, triggerType, filtered)

  await fetch(cfg.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5_000),
  })
}

function buildMessage(assetName: string, triggerType: TriggerType, alerts: AlertSummary[]): string {
  const ts = new Date().toISOString()

  if (triggerType === "scan_held") {
    const shown = alerts.slice(0, 10).map((a) => {
      const pkg = a.packageVersion ? `${a.packageName} ${a.packageVersion}` : a.packageName
      return `${a.externalId}  ${pkg}`
    })
    const more = alerts.length > shown.length ? `\n…and ${alerts.length - shown.length} more` : ""
    const intro = "heretix-api stopped reporting an unusually large share of this asset's open alerts although their packages did not change, so none of them were auto-resolved. Check heretix-api's data."
    return `⛔ *Scan kept ${alerts.length} alert(s) open* on *${assetName}*\n\n${intro}\n\n${shown.join("\n")}${more}\n\n${ts}`
  }

  if (triggerType === "kev_added") {
    const lines = alerts.map((a) => {
      const pkg = a.packageVersion ? `${a.packageName} ${a.packageVersion}` : a.packageName
      return `${a.externalId}  ${pkg}  ${severityKey(a)}`
    })
    return `🔴 *${alerts.length} alert(s) added to CISA KEV* on *${assetName}*\n\n${lines.join("\n")}\n\n${ts}`
  }

  // Group by severity tier. Keyed by tier, not the raw word, so a value the
  // order below doesn't list (e.g. "MODERATE") lands in its tier instead of
  // silently dropping out of the message.
  const groups = new Map<string, string[]>()
  for (const a of alerts) {
    const sev = severityKey(a)
    if (!groups.has(sev)) groups.set(sev, [])
    groups.get(sev)!.push(a.externalId)
  }

  const severityLines = [...SEVERITY_ORDER, "UNKNOWN"]
    .filter((s) => groups.has(s))
    .map((s) => {
      const ids = groups.get(s)!
      return `${s} (${ids.length})  ${ids.join(", ")}`
    })
    .join("\n")

  const emoji = triggerType === "detected" ? "🚨" : "⚠️"
  const verb = triggerType === "detected"
    ? `${alerts.length} new alert(s) detected`
    : `${alerts.length} alert(s) severity changed`

  return `${emoji} *${verb}* on *${assetName}*\n\n${severityLines}\n\n${ts}`
}

export async function testSlackWebhook(url: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "✅ heretix-management Slack test successful" }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`Slack returned ${res.status}`)
}

export type ScanFailure = { assetName: string; error: string }

/**
 * One message for a whole scheduled scan run, not one per asset: when heretix-api is
 * down every asset fails the same way, and seventeen identical messages say less than
 * one. Failures are grouped by their error.
 */
export function buildScanFailureMessage(total: number, failures: ScanFailure[], now = new Date()): string {
  const groups = new Map<string, string[]>()
  for (const f of failures) {
    const error = f.error.split("\n")[0].trim().slice(0, 160) || "unknown error"
    groups.set(error, [...(groups.get(error) ?? []), f.assetName])
  }
  const lines = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([error, names]) => {
      const shown = names.slice(0, 4).join(", ")
      const more = names.length > 4 ? `, and ${names.length - 4} more` : ""
      return `• ${names.length} × ${error}  (${shown}${more})`
    })
  const hidden = groups.size - lines.length
  return [
    `⛔ *Scheduled scan failed for ${failures.length} of ${total} asset(s)*`,
    "",
    ...lines,
    ...(hidden > 0 ? [`• and ${hidden} other error(s)`] : []),
    "",
    "These assets were not scanned; their alerts stay as they were. Each asset page has the details under Scan History.",
    now.toISOString(),
  ].join("\n")
}

/** The webhook, when Slack is on. Scan failures are about the system, so the tag and severity filters do not apply. */
async function slackWebhookUrl(): Promise<string | null> {
  const settings = await prisma.setting.findMany({ where: { key: { in: ["SLACK_ENABLED", "SLACK_WEBHOOK_URL"] } } })
  const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return cfg.SLACK_ENABLED === "true" && cfg.SLACK_WEBHOOK_URL ? cfg.SLACK_WEBHOOK_URL : null
}

async function postToSlack(url: string, text: string): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5_000),
  })
}

export async function notifySlackScanFailures(params: { total: number; failures: ScanFailure[] }): Promise<void> {
  if (params.failures.length === 0) return
  const url = await slackWebhookUrl()
  if (!url) return
  await postToSlack(url, buildScanFailureMessage(params.total, params.failures))
}

/** The scheduled scan could not run at all (the asset list could not be read, say). */
export async function notifySlackScanNotRun(error: string): Promise<void> {
  const url = await slackWebhookUrl()
  if (!url) return
  const reason = error.split("\n")[0].slice(0, 300)
  await postToSlack(url, `⛔ *Scheduled scan could not run*\n\n${reason}\n\n${new Date().toISOString()}`)
}
