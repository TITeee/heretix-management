import { prisma } from "@/lib/db"
import { TagsClient } from "./tags-client"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb"

import { countSeverityByKey, emptySeverityCounts as emptyCounts } from "@/lib/severity"

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
          where: { assetId: { in: allAssetIds }, status: { in: ["open", "in_progress"] } },
          select: { assetId: true, severity: true, cvssScore: true },
        })
      : [],
    allPkgNames.length > 0
      ? prisma.alert.findMany({
          where: { packageName: { in: allPkgNames }, status: { in: ["open", "in_progress"] } },
          select: { packageName: true, severity: true, cvssScore: true },
        })
      : [],
  ])

  // Per-assetId and per-packageName severity counts (getAlertSeverityTier)
  const assetAlertMap = countSeverityByKey(assetAlerts, (a) => a.assetId)
  const pkgAlertMap = countSeverityByKey(pkgAlerts, (a) => a.packageName)

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
