import { prisma } from "@/lib/db"
import { TagsClient } from "./tags-client"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb"

type SeverityCounts = { critical: number; high: number; medium: number; low: number; na: number }
const emptyCounts = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, na: 0 })

function scoreToKey(score: number | null): keyof SeverityCounts {
  if (score === null) return "na"
  if (score >= 9.0) return "critical"
  if (score >= 7.0) return "high"
  if (score >= 4.0) return "medium"
  return "low"
}

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { assetTags: true, packageTags: true } },
      assetTags: { select: { assetId: true } },
      packageTags: { select: { packageName: true } },
    },
  })

  // Collect all assetIds / packageNames across tags
  const allAssetIds = [...new Set(tags.flatMap(t => t.assetTags.map(at => at.assetId)))]
  const allPkgNames = [...new Set(tags.flatMap(t => t.packageTags.map(pt => pt.packageName)))]

  const [assetAlerts, pkgAlerts] = await Promise.all([
    allAssetIds.length > 0
      ? prisma.alert.findMany({
          where: { assetId: { in: allAssetIds }, status: { not: "resolved" } },
          select: { assetId: true, cvssScore: true },
        })
      : [],
    allPkgNames.length > 0
      ? prisma.alert.findMany({
          where: { packageName: { in: allPkgNames }, status: { not: "resolved" } },
          select: { packageName: true, cvssScore: true },
        })
      : [],
  ])

  // Build per-assetId and per-packageName severity counts
  const assetAlertMap = new Map<string, SeverityCounts>()
  for (const a of assetAlerts) {
    const c = assetAlertMap.get(a.assetId) ?? emptyCounts()
    c[scoreToKey(a.cvssScore)]++
    assetAlertMap.set(a.assetId, c)
  }

  const pkgAlertMap = new Map<string, SeverityCounts>()
  for (const a of pkgAlerts) {
    if (!a.packageName) continue
    const c = pkgAlertMap.get(a.packageName) ?? emptyCounts()
    c[scoreToKey(a.cvssScore)]++
    pkgAlertMap.set(a.packageName, c)
  }

  // Aggregate per tag
  const tagsWithAlerts = tags.map(tag => {
    const counts = emptyCounts()
    if (tag.type === "asset") {
      for (const { assetId } of tag.assetTags) {
        const c = assetAlertMap.get(assetId)
        if (c) { counts.critical += c.critical; counts.high += c.high; counts.medium += c.medium; counts.low += c.low; counts.na += c.na }
      }
    } else {
      for (const { packageName } of tag.packageTags) {
        const c = pkgAlertMap.get(packageName)
        if (c) { counts.critical += c.critical; counts.high += c.high; counts.medium += c.medium; counts.low += c.low; counts.na += c.na }
      }
    }
    return { ...tag, openAlerts: counts }
  })

  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Tags</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <TagsClient tags={tagsWithAlerts} />
    </div>
  )
}
