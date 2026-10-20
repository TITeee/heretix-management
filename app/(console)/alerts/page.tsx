import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"
import { AlertsList } from "./alerts-list"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"
import { severityTierFromKey, severityTierWhere } from "@/lib/severity"
import { loadAllListAlerts } from "@/lib/alerts/load-all"
import { parseAlertQuery } from "@/lib/alerts/query-params"
import { alertListFacets, listAlertPage } from "@/lib/alerts/query"

type SearchParams = Record<string, string | string[] | undefined>

async function loadSlaConfig(): Promise<SlaConfig> {
  const slaSetting = await prisma.setting.findUnique({ where: { key: "sla_config" } })
  if (slaSetting) {
    try {
      return { ...DEFAULT_SLA_CONFIG, ...(JSON.parse(slaSetting.value) as Partial<SlaConfig>) }
    } catch {
      // Use default if parsing fails
    }
  }
  return DEFAULT_SLA_CONFIG
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  // The list before it paged on the server, kept for a release in case the
  // new one gets something wrong: /alerts?legacy=1.
  if (params.legacy === "1") return <LegacyAlertsPage params={params} />

  const query = parseAlertQuery(params)
  const singleAsset = query.assetIds.length === 1 ? query.assetIds[0] : undefined
  const [page, facets, slaConfig, vexCount] = await Promise.all([
    listAlertPage(query),
    alertListFacets(),
    loadSlaConfig(),
    // Mirrors the VEX exporter: accepted_risk stays internal, so it does not enable the button.
    prisma.alert.count({
      where: {
        status: "ignored",
        OR: [{ ignoreReason: "false_positive" }, { AND: [{ vexJustification: { not: null } }, { vexJustification: { not: "" } }] }],
        ...(singleAsset ? { assetId: singleAsset } : {}),
      },
    }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsList
        rows={page.rows}
        total={page.total}
        query={query}
        facets={facets}
        slaEnabled={slaConfig.slaEnabled}
        hasVex={vexCount > 0}
      />
    </div>
  )
}

async function LegacyAlertsPage({ params }: { params: SearchParams }) {
  const one = (key: string) => {
    const v = params[key]
    return Array.isArray(v) ? v[0] : v
  }
  const assetId = one("assetId"), status = one("status"), severity = one("severity"), kev = one("kev")
  const packageName = one("packageName"), packageVersion = one("packageVersion")
  // ?severity= is a tier (AlertSummaryBadges' keys: CRITICAL..LOW, UNKNOWN for
  // N/A), matched the way getAlertSeverityTier decides it, so following a
  // badge's link lists exactly the alerts the badge counted.
  const severityTier = severity ? severityTierFromKey(severity) : null
  const [alertsWithTags, slaConfig] = await Promise.all([
    loadAllListAlerts({
      ...(assetId ? { assetId } : {}),
      ...(status ? { status } : {}),
      ...(packageName ? { packageName } : {}),
      ...(packageVersion ? { packageVersion } : {}),
      ...(severityTier ? severityTierWhere(severityTier) : severity ? { severity } : {}),
      ...(kev ? { isKev: true } : {}),
    }),
    loadSlaConfig(),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alertsWithTags} initialPackageName={packageName} initialAssetId={assetId} slaEnabled={slaConfig.slaEnabled} />
    </div>
  )
}
