import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { Bell, FileDown, FileJson } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TagBadge } from "@/components/tags/tag-badge"
import { EditTagsPopover } from "./edit-tags-popover"
import Link from "next/link"
import { ScanButton } from "./scan-button"
import { getScanStatuses } from "@/lib/scan-status"
import { ImportVexButton } from "./import-vex-button"
import { EditAssetDialog } from "./edit-asset-dialog"
import { DeleteAssetButton } from "./delete-asset-button"
import { AddPackageDialog } from "./add-package-dialog"
import { PackagesTable } from "./packages-table"
import { ScanHistoryModal } from "./scan-history-modal"
import { PackageHistoryModal } from "./package-history-modal"
import { DependencyGraphLoader } from "./dependency-graph-loader"
import { RemediationTab } from "./remediation-tab"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AlertSummaryBadges, buildAlertSummary, type AlertSummary } from "@/components/alerts/alert-summary-badges"
import { countSeverityByKey, emptySeverityCounts } from "@/lib/severity"
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
      // rawVersion/deps/sourcePackage aren't used on this page (the
      // dependency graph fetches its own data separately) — select only
      // what packagesWithAlerts/PackagesTable actually read.
      packages: {
        select: {
          id: true,
          name: true,
          version: true,
          ecosystem: true,
          source: true,
          location: true,
          cpe: true,
          direct: true,
          scope: true,
          category: true,
          licenses: true,
        },
      },
      _count: { select: { alerts: true } },
      scanJobs: { orderBy: { createdAt: "desc" }, take: 5 },
      packageHistories: { orderBy: { changedAt: "desc" }, take: 50 },
      assetTags: {
        include: { tag: { select: { id: true, name: true, color: true, description: true } } },
      },
    },
  })
  if (!asset) notFound()
  const scanStatus = (await getScanStatuses(asset.id)).get(asset.id)

  const openAlerts = await prisma.alert.count({
    where: { assetId: id, status: { in: ["open", "in_progress"] } },
  })

  const severityCounts = await prisma.alert.groupBy({
    by: ["severity", "cvssScore"],
    where: { assetId: id, status: { in: ["open", "in_progress"] } },
    _count: { id: true },
  })
  const alertSummary: AlertSummary = buildAlertSummary(severityCounts)

  const kevCount = await prisma.alert.count({
    where: { assetId: id, status: { in: ["open", "in_progress"] }, isKev: true },
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
  // Restricted to open/in_progress to match both the per-severity badges beside
  // it and the Alerts page this column links to, which filters to those two by
  // default — an unfiltered count would promise rows the link doesn't show.
  // Bucketed in memory rather than grouped in SQL because the severity split is
  // needed per package; tiered by getAlertSeverityTier so these agree with the
  // Open Alert Summary block on this same page.
  const alertRows = await prisma.alert.findMany({
    where: { assetId: id, status: { in: ["open", "in_progress"] } },
    select: { packageName: true, packageVersion: true, severity: true, cvssScore: true },
  })
  const pkgAlertMap = countSeverityByKey(alertRows, (a) => `${a.packageName}::${a.packageVersion}`)
  const packagesWithAlerts = asset.packages.map(p => {
    const s = pkgAlertMap.get(`${p.name}::${p.version}`) ?? emptySeverityCounts()
    return {
      ...p,
      alertCount: s.critical + s.high + s.medium + s.low + s.na,
      alertSeverities: s,
    }
  })

  const tags = asset.assetTags
    .map((at) => at.tag)
    .sort((a, b) => a.name.localeCompare(b.name))

  const ecosystemCounts = new Map<string, number>()
  for (const p of asset.packages) {
    ecosystemCounts.set(p.ecosystem, (ecosystemCounts.get(p.ecosystem) ?? 0) + 1)
  }
  const ecosystemBreakdown = [...ecosystemCounts.entries()].sort((a, b) => b[1] - a[1])

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
          <EditAssetDialog asset={{ id: asset.id, name: asset.name, hostname: asset.hostname, assetType: asset.assetType, isManual: asset.osId === "manual" }} />
          <DeleteAssetButton assetId={asset.id} assetName={asset.name || asset.hostname} />
          {/* A manually registered asset (network device, firewall) has no SBOM to update from. */}
          {asset.osId !== "manual" && (
            <Link href={`/assets/new?assetId=${id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <FileJson className="h-4 w-4" />
              Update from SBOM
            </Link>
          )}
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
          {/* A manually registered asset has no OS of its own to show; its product and version are Advisory packages. */}
          <CardContent className="text-sm">{asset.osId === "manual" ? "Manual" : asset.osName}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Packages</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <div className="text-2xl font-bold">{asset.packages.length}</div>
            {ecosystemBreakdown.length > 0 && (
              <div className="flex flex-col text-xs">
                {ecosystemBreakdown.map(([eco, count]) => (
                  <span key={eco} className="flex gap-2">
                    <span>{eco}</span>
                    <span>{count}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Tags</CardTitle>
            <EditTagsPopover assetId={id} assignedIds={tags.map((t) => t.id)} />
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <span className="text-sm text-muted-foreground">No tags assigned</span>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {tags.map((tag) => (
                  <Link key={tag.id} href={`/tags/${tag.id}`} title={tag.description ?? undefined}>
                    <TagBadge tag={tag} className="hover:bg-accent" />
                  </Link>
                ))}
              </div>
            )}
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Last Scan</CardTitle>
              {asset.scanJobs.length > 0 && <ScanHistoryModal scanJobs={asset.scanJobs} />}
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {scanStatus?.lastSuccessAt ? new Date(scanStatus.lastSuccessAt).toLocaleString() : "Not scanned yet"}
            {scanStatus?.lastAttempt?.failed && (
              <p className="mt-1 text-xs text-destructive">
                The latest scan failed ({new Date(scanStatus.lastAttempt.at).toLocaleString()})
                {scanStatus.lastAttempt.error ? `: ${scanStatus.lastAttempt.error.slice(0, 160)}` : ""}.
                Alerts are as the last successful scan left them.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alert Summary */}
      <div className="rounded-lg border p-4 space-y-2 w-fit min-w-64">
        <h2 className="text-sm font-semibold">Open Alert Summary</h2>
        <AlertSummaryBadges summary={alertSummary} kevCount={kevCount} assetId={id} />
      </div>

      {/* Remediation / Packages / Dependency Graph tabs. Opens on Remediation:
          what to change comes before the package list. */}
      <Tabs defaultValue="remediation">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="remediation">Remediation</TabsTrigger>
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
        <TabsContent value="remediation">
          <RemediationTab assetId={id} />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesTable data={packagesWithAlerts} assetId={id} />
        </TabsContent>
        <TabsContent value="graph">
          <DependencyGraphLoader assetId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
