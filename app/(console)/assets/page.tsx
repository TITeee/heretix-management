import { prisma } from "@/lib/db"
import { emptySeverityCounts } from "@/lib/severity"
import { activeSeverityByAsset } from "@/lib/dashboard-data"
import { getScanStatuses } from "@/lib/scan-status"
import { AssetsTable } from "./assets-table"
import { RescanAllButton } from "./rescan-all-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, FileSpreadsheet, FileJson } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { connection } from "next/server"

async function getAssets() {
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { packages: true, alerts: true } },
      assetTags: { include: { tag: { select: { id: true, name: true, color: true, isDefault: true } } } },
    },
  })

  // Counted by the database: reading every open alert to count them here took 2 s and
  // a few hundred MB with 1.7 million alerts.
  const openMap = await activeSeverityByAsset()

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

  // The last scan that completed, from the scan jobs: Asset.scannedAt is also set by an inventory import.
  const scanStatuses = await getScanStatuses()

  return assets.map((a) => ({
    ...a,
    scannedAt: scanStatuses.get(a.id)?.lastSuccessAt ?? null,
    scanFailed: scanStatuses.get(a.id)?.lastAttempt?.failed ?? false,
    openAlerts: openMap.get(a.id) ?? emptySeverityCounts(),
    tags: a.assetTags.map(at => at.tag),
    licenses: licenseMap.get(a.id) ?? [],
  }))
}

export default async function AssetsPage() {
  // Rendered per request: the console's sign-in check is in the layout, which renders
  // beside this page, so without this the build tried to prerender it and ran its queries
  // with no database (prisma:error in every image build).
  await connection()
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
          <RescanAllButton assetCount={assets.length} />
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
