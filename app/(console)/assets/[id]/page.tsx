import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { ScanButton } from "./scan-button"
import { EditAssetDialog } from "./edit-asset-dialog"
import { AddPackageDialog } from "./add-package-dialog"
import { PackagesTable } from "./packages-table"
import { ScanHistoryModal } from "./scan-history-modal"
import { PackageHistoryModal } from "./package-history-modal"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      packages: true,
      _count: { select: { alerts: true } },
      scanJobs: { orderBy: { createdAt: "desc" }, take: 5 },
      packageHistories: { orderBy: { changedAt: "desc" }, take: 50 },
    },
  })
  if (!asset) notFound()

  const openAlerts = await prisma.alert.count({
    where: { assetId: id, status: { not: "resolved" } },
  })

  const pkgAlertCounts = await prisma.alert.groupBy({
    by: ["packageName"],
    where: { assetId: id },
    _count: { id: true },
  })
  const pkgAlertMap = new Map(pkgAlertCounts.map(r => [r.packageName, r._count.id]))
  const packagesWithAlerts = asset.packages.map(p => ({
    ...p,
    alertCount: pkgAlertMap.get(p.name) ?? 0,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/assets">Assets</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{asset.name || asset.hostname}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{asset.name || asset.hostname}</h1>
          {/* <p className="text-sm text-muted-foreground">
            {asset.hostname} · {asset.osName}
          </p> */}
        </div>
        <div className="flex items-center gap-2">
          <EditAssetDialog asset={{ id: asset.id, name: asset.name, hostname: asset.hostname, osName: asset.osName, osVersionId: asset.osVersionId }} />
          <Link href={`/alerts?assetId=${id}`}>
            <Button variant="outline" size="sm">
              {openAlerts} Open Alerts
            </Button>
          </Link>
          <ScanButton assetId={id} />
        </div>
      </div>

      {/* Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">OS</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{asset.osName}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Packages</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{asset.packages.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Last Scan</CardTitle>
              {asset.scanJobs.length > 0 && <ScanHistoryModal scanJobs={asset.scanJobs} />}
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {asset.scannedAt ? new Date(asset.scannedAt).toLocaleString() : "Not scanned yet"}
          </CardContent>
        </Card>
      </div>

      {/* Packages table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Packages</h2>
          <div className="flex items-center gap-2">
            {asset.packageHistories.length > 0 && (
              <PackageHistoryModal entries={asset.packageHistories} />
            )}
            <AddPackageDialog assetId={id} />
          </div>
        </div>
        <PackagesTable data={packagesWithAlerts} assetId={id} />
      </div>
    </div>
  )
}
