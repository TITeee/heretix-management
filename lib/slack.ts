import { prisma } from "@/lib/db"

export type AlertSummary = {
  packageName: string
  packageVersion?: string | null
  externalId: string
  severity: string | null
  cvssScore: number | null
}

type TriggerType = "detected" | "severity_changed" | "kev_added"

const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

function meetsMinSeverity(severity: string | null, min: string): boolean {
  if (min === "ALL") return true
  if (!severity) return false
  const alertIdx = SEVERITY_ORDER.indexOf(severity.toUpperCase())
  const minIdx = SEVERITY_ORDER.indexOf(min.toUpperCase())
  return alertIdx >= minIdx
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

  // Severity filter (kev_added bypasses it)
  const minSeverity = cfg.SLACK_MIN_SEVERITY ?? "ALL"
  const filtered = triggerType === "kev_added"
    ? alerts
    : alerts.filter((a) => meetsMinSeverity(a.severity, minSeverity))

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

  if (triggerType === "kev_added") {
    const lines = alerts.map((a) => {
      const pkg = a.packageVersion ? `${a.packageName} ${a.packageVersion}` : a.packageName
      return `${a.externalId}  ${pkg}  ${a.severity ?? "UNKNOWN"}`
    })
    return `🔴 *${alerts.length} alert(s) added to CISA KEV* on *${assetName}*\n\n${lines.join("\n")}\n\n${ts}`
  }

  // Group by severity
  const groups = new Map<string, string[]>()
  for (const a of alerts) {
    const sev = a.severity?.toUpperCase() ?? "UNKNOWN"
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
