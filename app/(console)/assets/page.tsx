import { prisma } from "@/lib/db"
import { AssetsTable } from "./assets-table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

async function getAssets() {
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { packages: true, alerts: true } },
      assetTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  })

  const openAlertRows = await prisma.alert.findMany({
    where: { status: { not: "resolved" } },
    select: { assetId: true, cvssScore: true },
  })

  type SeverityCounts = { critical: number; high: number; medium: number; low: number; na: number }
  const openMap = new Map<string, SeverityCounts>()
  for (const alert of openAlertRows) {
    const counts = openMap.get(alert.assetId) ?? { critical: 0, high: 0, medium: 0, low: 0, na: 0 }
    const score = alert.cvssScore
    if (score === null) counts.na++
    else if (score >= 9.0) counts.critical++
    else if (score >= 7.0) counts.high++
    else if (score >= 4.0) counts.medium++
    else counts.low++
    openMap.set(alert.assetId, counts)
  }

  return assets.map((a) => ({
    ...a,
    openAlerts: openMap.get(a.id) ?? { critical: 0, high: 0, medium: 0, low: 0, na: 0 },
    tags: a.assetTags.map(at => at.tag),
  }))
}

export default async function AssetsPage() {
  const assets = await getAssets()

  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Assets</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="flex gap-2">
          <Link href="/assets/new-manual">
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Manually
            </Button>
          </Link>
          <Link href="/assets/new">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Import inventory.json
            </Button>
          </Link>
        </div>
      </div>
      <AssetsTable data={assets} />
    </div>
  )
}
