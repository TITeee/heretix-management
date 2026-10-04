import { prisma } from "@/lib/db"
import { countSeverityByKey, emptySeverityCounts } from "@/lib/severity"
import { AssetsTable } from "./assets-table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, FileSpreadsheet, FileJson } from "lucide-react"
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
    where: { status: { in: ["open", "in_progress"] } },
    select: { assetId: true, severity: true, cvssScore: true },
  })
  const openMap = countSeverityByKey(openAlertRows, (a) => a.assetId)

  // The distinct license strings in each asset's inventory, for the License
  // filter. Unnested in SQL: reading every package row just to collect these
  // would pull the whole inventory of every asset into memory.
  const licenseRows = await prisma.$queryRaw<{ assetId: string; license: string }[]>`
    SELECT DISTINCT "assetId", unnest("licenses") AS license FROM "Package"
  `
  const licenseMap = new Map<string, string[]>()
  for (const { assetId, license } of licenseRows) {
    const list = licenseMap.get(assetId)
    if (list) list.push(license)
    else licenseMap.set(assetId, [license])
  }

  return assets.map((a) => ({
    ...a,
    openAlerts: openMap.get(a.id) ?? emptySeverityCounts(),
    tags: a.assetTags.map(at => at.tag),
    licenses: licenseMap.get(a.id) ?? [],
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
          <Link href="/assets/import-csv">
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Import CSV
            </Button>
          </Link>
          <Link href="/assets/new">
            <Button size="sm">
              <FileJson className="mr-1 h-4 w-4" /> Import SBOM
            </Button>
          </Link>
        </div>
      </div>
      <AssetsTable data={assets} />
    </div>
  )
}
