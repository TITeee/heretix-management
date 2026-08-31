import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { Bell, FileDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ScanButton } from "./scan-button"
import { ImportVexButton } from "./import-vex-button"
import { EditAssetDialog } from "./edit-asset-dialog"
import { AddPackageDialog } from "./add-package-dialog"
import { PackagesTable } from "./packages-table"
import { ScanHistoryModal } from "./scan-history-modal"
import { PackageHistoryModal } from "./package-history-modal"
import { DependencyGraph } from "./dependency-graph"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
      assetTags: {
        include: { tag: { select: { id: true, name: true, color: true, description: true } } },
      },
    },
  })
  if (!asset) notFound()

  const openAlerts = await prisma.alert.count({
    where: { assetId: id, status: { in: ["open", "in_progress"] } },
  })

  // Mirrors the exporter: accepted_risk stays internal, so it does not enable the button.
  const vexCount = await prisma.alert.count({
    where: {
      assetId: id,
      status: "ignored",
      OR: [{ ignoreReason: "false_positive" }, { vexJustification: { not: null } }],
    },
  })

  // Grouped by version as well as name: RPM-style packages routinely keep several
  // installed versions side by side (e.g. old kernel builds left in place after an
  // upgrade), and each is a distinct Package row with its own alerts. Grouping by
  // name alone summed every version's alerts onto each row.
  const pkgAlertCounts = await prisma.alert.groupBy({
    by: ["packageName", "packageVersion"],
    where: { assetId: id },
    _count: { id: true },
  })
  const pkgAlertMap = new Map(pkgAlertCounts.map(r => [`${r.packageName}::${r.packageVersion}`, r._count.id]))
  const packagesWithAlerts = asset.packages.map(p => ({
    ...p,
    alertCount: pkgAlertMap.get(`${p.name}::${p.version}`) ?? 0,
  }))

  const tags = asset.assetTags
    .map((at) => at.tag)
    .sort((a, b) => a.name.localeCompare(b.name))

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
          <a
            {...(vexCount > 0 ? { href: `/api/vex?assetId=${id}&download=true` } : {})}
            aria-disabled={vexCount === 0}
            title={vexCount === 0 ? "No ignored alerts with an exportable reason yet" : undefined}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              vexCount === 0 && "pointer-events-none opacity-50"
            )}
          >
            <FileDown className="h-4 w-4" />
            Export VEX
          </a>
          <ImportVexButton assetId={id} />
          <Link href={`/alerts?assetId=${id}`}>
            <Button variant="destructive" size="sm">
              <Bell className="h-4 w-4" />
              {openAlerts} Open Alerts
            </Button>
          </Link>
          <ScanButton assetId={id} />
        </div>
      </div>

      {/* Info */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Scanner</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {asset.sbomTool ?? "Unknown"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              // Tags are assigned from the Tags section, not here — point there rather
              // than leaving a dead end, since this card is the likeliest place someone
              // notices an asset is untagged.
              <Link href="/tags" className="text-sm text-muted-foreground hover:underline">
                No tags assigned
              </Link>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {tags.map((tag) => (
                  <Link key={tag.id} href={`/tags/${tag.id}`} title={tag.description ?? undefined}>
                    <Badge
                      variant="outline"
                      className="text-xs font-medium hover:bg-accent"
                      style={tag.color ? { color: tag.color, borderColor: tag.color } : undefined}
                    >
                      {tag.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Packages / Dependency Graph tabs */}
      <Tabs defaultValue="packages">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="packages">Packages</TabsTrigger>
            <TabsTrigger value="graph">Dependency Graph</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {asset.packageHistories.length > 0 && (
              <PackageHistoryModal entries={asset.packageHistories} />
            )}
            <AddPackageDialog assetId={id} />
          </div>
        </div>
        <TabsContent value="packages">
          <PackagesTable data={packagesWithAlerts} assetId={id} />
        </TabsContent>
        <TabsContent value="graph">
          <DependencyGraph assetId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
