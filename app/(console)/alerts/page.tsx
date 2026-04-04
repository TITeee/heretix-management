import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"

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
    return { ...alert, asset, tags }
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alertsWithTags} initialPackageName={params.packageName} />
    </div>
  )
}
