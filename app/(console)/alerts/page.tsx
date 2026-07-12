import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string; status?: string; severity?: string; packageName?: string }>
}) {
  const params = await searchParams
  const alerts = await prisma.alert.findMany({
    where: {
      ...(params.assetId ? { assetId: params.assetId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.packageName ? { packageName: params.packageName } : {}),
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

  // Fetch direct/indirect flag from Package table for each alert
  const packages = await prisma.package.findMany({
    where: {
      OR: alerts.map(a => ({ assetId: a.assetId, name: a.packageName, version: a.packageVersion })),
    },
    select: { assetId: true, name: true, version: true, direct: true },
  })
  const directMap = new Map(packages.map(p => [`${p.assetId}::${p.name}::${p.version}`, p.direct]))

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
    const packageDirect = directMap.get(`${alert.assetId}::${alert.packageName}::${alert.packageVersion}`) ?? null
    return { ...alert, asset, tags, packageDirect }
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alertsWithTags} initialPackageName={params.packageName} initialAssetId={params.assetId} slaEnabled={slaConfig.slaEnabled} />
    </div>
  )
}
