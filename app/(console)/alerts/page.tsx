import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string; status?: string; severity?: string; packageName?: string; packageVersion?: string }>
}) {
  const params = await searchParams
  const alerts = await prisma.alert.findMany({
    where: {
      ...(params.assetId ? { assetId: params.assetId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.packageName ? { packageName: params.packageName } : {}),
      ...(params.packageVersion ? { packageVersion: params.packageVersion } : {}),
    },
    orderBy: [{ cvssScore: "desc" }, { detectedAt: "desc" }],
    include: {
      asset: {
        include: {
          assetTags: { include: { tag: { select: { id: true, name: true, color: true } } } }
        }
      }
    },
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

  const packageNames = [...new Set(alerts.map(a => a.packageName))]
  const packageTags = await prisma.packageTag.findMany({
    where: { packageName: { in: packageNames } },
    include: { tag: { select: { id: true, name: true, color: true } } }
  })

  const packageTagMap = new Map<string, { id: string; name: string; color: string | null }[]>()
  for (const pt of packageTags) {
    if (!packageTagMap.has(pt.packageName)) packageTagMap.set(pt.packageName, [])
    packageTagMap.get(pt.packageName)!.push(pt.tag)
  }

  // Fetch direct/indirect flag from Package table for each alert. One OR condition
  // per alert would blow past Postgres's parameter limit once the unfiltered alert
  // list grows large; fetching every package for the affected assets and matching
  // in memory instead scales with asset count.
  const packages = await prisma.package.findMany({
    where: { assetId: { in: [...new Set(alerts.map(a => a.assetId))] } },
    select: { assetId: true, name: true, version: true, direct: true },
  })
  const directMap = new Map(packages.map(p => [`${p.assetId}::${p.name}::${p.version}`, p.direct]))
  // An alert whose package is no longer in the asset's current inventory is left
  // open rather than auto-resolved (see lib/package-diff.ts) — a scan can only
  // vouch for findings on packages it actually queried, so this needs a human
  // to confirm it's a genuine fix and not scan/import noise. Surfacing it here
  // instead of silently leaving the count out of sync with views (like the
  // dependency graph) that can only show currently-inventoried packages.
  const packageKeys = new Set(packages.map(p => `${p.assetId}::${p.name}::${p.version}`))

  const alertsWithTags = alerts.map(alert => {
    const assetTagsList = alert.asset.assetTags.map(at => at.tag)
    const pkgTagsList = packageTagMap.get(alert.packageName) ?? []
    const seen = new Set<string>()
    const tags = [...assetTagsList, ...pkgTagsList].filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    const { assetTags: _, ...asset } = alert.asset
    const pkgKey = `${alert.assetId}::${alert.packageName}::${alert.packageVersion}`
    const packageDirect = directMap.get(pkgKey) ?? null
    const packageExists = packageKeys.has(pkgKey)
    return { ...alert, asset, tags, packageDirect, packageExists }
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alertsWithTags} initialPackageName={params.packageName} initialAssetId={params.assetId} slaEnabled={slaConfig.slaEnabled} />
    </div>
  )
}
