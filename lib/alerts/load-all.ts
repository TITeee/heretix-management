/**
 * Every alert matching `where`, shaped for the Alerts list as the browser
 * filters it (lib/alerts/list-filters.ts): with its asset, its tags (the
 * asset's and the package's) and whether its package is in the asset's
 * current inventory, and as a direct or indirect dependency. Moved out of
 * app/(console)/alerts/page.tsx unchanged.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { Alert } from "@/lib/alerts/list-filters"

export async function loadAllListAlerts(where: Prisma.AlertWhereInput): Promise<Alert[]> {
  const alerts = await prisma.alert.findMany({
    where,
    orderBy: [{ cvssScore: "desc" }, { detectedAt: "desc" }],
    include: {
      // Only id/name/hostname reach the client (see the destructure below);
      // `include` here would pull every Asset scalar (osId, scannedAt,
      // sbomTool, timestamps, ...) into every alert row for nothing.
      asset: {
        select: {
          id: true,
          name: true,
          hostname: true,
          assetTags: { include: { tag: { select: { id: true, name: true, color: true, isDefault: true } } } }
        }
      }
    },
  })

  const packageNames = [...new Set(alerts.map(a => a.packageName))]
  const packageTags = await prisma.packageTag.findMany({
    where: { packageName: { in: packageNames } },
    include: { tag: { select: { id: true, name: true, color: true, isDefault: true } } }
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

  return alerts.map(alert => {
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
}
