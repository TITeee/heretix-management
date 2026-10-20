import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"
import { severityTierFromKey, severityTierWhere } from "@/lib/severity"
import { loadAllListAlerts } from "@/lib/alerts/load-all"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string; status?: string; severity?: string; kev?: string; packageName?: string; packageVersion?: string }>
}) {
  const params = await searchParams
  // ?severity= is a tier (AlertSummaryBadges' keys: CRITICAL..LOW, UNKNOWN for
  // N/A), matched the way getAlertSeverityTier decides it, so following a
  // badge's link lists exactly the alerts the badge counted.
  const severityTier = params.severity ? severityTierFromKey(params.severity) : null
  const alertsWithTags = await loadAllListAlerts({
    ...(params.assetId ? { assetId: params.assetId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.packageName ? { packageName: params.packageName } : {}),
    ...(params.packageVersion ? { packageVersion: params.packageVersion } : {}),
    ...(severityTier ? severityTierWhere(severityTier) : params.severity ? { severity: params.severity } : {}),
    ...(params.kev ? { isKev: true } : {}),
  })

  const slaSetting = await prisma.setting.findUnique({ where: { key: "sla_config" } })
  let slaConfig = DEFAULT_SLA_CONFIG
  if (slaSetting) {
    try {
      slaConfig = { ...DEFAULT_SLA_CONFIG, ...(JSON.parse(slaSetting.value) as Partial<SlaConfig>) }
    } catch {
      // Use default if parsing fails
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alertsWithTags} initialPackageName={params.packageName} initialAssetId={params.assetId} slaEnabled={slaConfig.slaEnabled} />
    </div>
  )
}
