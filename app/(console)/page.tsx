import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Server, Bell, ShieldAlert, CheckCircle2, Package, CalendarClock, Info } from "lucide-react"
import Link from "next/link"
import { AlertsTrend } from "@/components/dashboard/alerts-trend"
import { TopAssetsChart, type AssetBarData } from "@/components/dashboard/top-assets-chart"
import { TopPackagesChart } from "@/components/dashboard/top-packages-chart"
import { KevHighlights } from "@/components/dashboard/kev-highlights"
import { RecentAlertsClient } from "@/components/dashboard/recent-alerts-client"
import { TagSeverityDonut } from "@/components/dashboard/tag-severity-donut"
import { CriticalPackagesCard } from "@/components/dashboard/critical-packages-card"
import { ProductionAssetsCard } from "@/components/dashboard/production-assets-card"
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs"

// ── helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function buildWeeklyTrend(
  alerts: { detectedAt: Date }[]
): { week: string; count: number }[] {
  const now = new Date()
  const currentMonday = getMonday(now)

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(currentMonday)
    start.setDate(start.getDate() - (7 - i) * 7)
    return {
      start,
      label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    }
  })

  for (const alert of alerts) {
    const monday = getMonday(new Date(alert.detectedAt))
    const idx = weeks.findIndex((w) => w.start.getTime() === monday.getTime())
    if (idx !== -1) weeks[idx].count++
  }

  return weeks.map((w) => ({ week: w.label, count: w.count }))
}

function buildTagSeverity(alerts: { cvssScore: number | null }[]) {
  let critical = 0, high = 0, medium = 0, low = 0, na = 0
  for (const alert of alerts) {
    const s = alert.cvssScore
    if (!s) na++
    else if (s >= 9) critical++
    else if (s >= 7) high++
    else if (s >= 4) medium++
    else low++
  }
  return { critical, high, medium, low, na }
}

function buildTopAssets(
  alerts: {
    assetId: string
    cvssScore: number | null
    asset: { name: string; hostname: string }
  }[]
): AssetBarData[] {
  const map = new Map<string, AssetBarData>()

  for (const alert of alerts) {
    const label = alert.asset.name || alert.asset.hostname
    if (!map.has(alert.assetId)) {
      map.set(alert.assetId, { name: label, critical: 0, high: 0, medium: 0, low: 0, na: 0 })
    }
    const entry = map.get(alert.assetId)!
    const s = alert.cvssScore
    if (!s) entry.na++
    else if (s >= 9) entry.critical++
    else if (s >= 7) entry.high++
    else if (s >= 4) entry.medium++
    else entry.low++
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        b.critical + b.high + b.medium + b.low + b.na -
        (a.critical + a.high + a.medium + a.low + a.na)
    )
    .slice(0, 10)
}

// ── data fetching ─────────────────────────────────────────────────────────────

async function getDashboardData() {
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    totalAssets,
    totalAlerts,
    openAlerts,
    criticalAlerts,
    recentAlerts,
    trendAlerts,
    topAssetAlerts,
    topPkgGroups,
    kevAlerts,
    productionAlertRaw,
    developmentAlertRaw,
    stagingAlertRaw,
    totalPackages,
    todayAlerts,
    allTags,
  ] = await Promise.all([
    prisma.asset.count(),
    prisma.alert.count(),
    prisma.alert.count({ where: { status: "open" } }),
    prisma.alert.count({ where: { status: { in: ["open", "in_progress"] }, cvssScore: { gte: 9.0 } } }),
    prisma.alert.findMany({
      take: 10,
      orderBy: { detectedAt: "desc" },
      include: { asset: { select: { id: true, name: true, hostname: true } } },
    }),
    // A3 trend
    prisma.alert.findMany({
      select: { detectedAt: true },
      where: { detectedAt: { gte: eightWeeksAgo } },
    }),
    // B1 top assets
    prisma.alert.findMany({
      select: {
        assetId: true,
        cvssScore: true,
        asset: { select: { name: true, hostname: true } },
      },
      where: { status: { in: ["open", "in_progress"] } },
    }),
    // B2 top packages
    prisma.alert.groupBy({
      by: ["packageName"],
      _count: { id: true },
      where: { status: { in: ["open", "in_progress"] } },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    // B3 KEV
    prisma.alert.findMany({
      where: { isKev: true, status: { in: ["open", "in_progress"] } },
      select: {
        id: true,
        externalId: true,
        packageName: true,
        cvssScore: true,
        epssScore: true,
        isKev: true,
        assetId: true,
        asset: { select: { name: true, hostname: true } },
      },
      orderBy: { cvssScore: "desc" },
      take: 10,
    }),
    // C1 Production tag severity
    prisma.alert.findMany({
      select: { cvssScore: true },
      where: { status: { in: ["open", "in_progress"] }, asset: { assetTags: { some: { tag: { name: "Production" } } } } },
    }),
    // C2 Development tag severity
    prisma.alert.findMany({
      select: { cvssScore: true },
      where: { status: { in: ["open", "in_progress"] }, asset: { assetTags: { some: { tag: { name: "Development" } } } } },
    }),
    // C3 Staging tag severity
    prisma.alert.findMany({
      select: { cvssScore: true },
      where: { status: { in: ["open", "in_progress"] }, asset: { assetTags: { some: { tag: { name: "Staging" } } } } },
    }),
    // stats
    prisma.package.count(),
    prisma.alert.count({ where: { detectedAt: { gte: todayStart } } }),
    // All tags for Tags tab (default tags first, then alphabetical)
    prisma.tag.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, color: true },
    }),
  ])

  const trendData = buildWeeklyTrend(trendAlerts)
  const topAssetsData = buildTopAssets(topAssetAlerts)
  const topPackagesData = topPkgGroups.map((g) => ({ name: g.packageName, count: g._count.id }))

  // ── Tags tab: fetch all asset/package relationships for every tag ─────────
  const assetTagIds = allTags.filter((t) => t.type === "asset").map((t) => t.id)
  const packageTagIds = allTags.filter((t) => t.type === "package").map((t) => t.id)

  const [assetTagRecords, packageTagRecords] = await Promise.all([
    prisma.assetTag.findMany({
      where: { tagId: { in: assetTagIds } },
      select: { tagId: true, asset: { select: { id: true, name: true, hostname: true, assetType: true } } },
    }),
    prisma.packageTag.findMany({
      where: { tagId: { in: packageTagIds } },
      select: { tagId: true, packageName: true },
    }),
  ])

  // Group by tagId
  const assetsByTagId = new Map<string, { id: string; name: string; hostname: string; assetType: string }[]>()
  for (const r of assetTagRecords) {
    if (!assetsByTagId.has(r.tagId)) assetsByTagId.set(r.tagId, [])
    assetsByTagId.get(r.tagId)!.push(r.asset)
  }
  const pkgNamesByTagId = new Map<string, string[]>()
  for (const r of packageTagRecords) {
    if (!pkgNamesByTagId.has(r.tagId)) pkgNamesByTagId.set(r.tagId, [])
    pkgNamesByTagId.get(r.tagId)!.push(r.packageName)
  }

  const allTaggedAssetIds = [...new Set(assetTagRecords.map((r) => r.asset.id))]
  const allTaggedPkgNames = [...new Set(packageTagRecords.map((r) => r.packageName))]

  const [assetAlertGroups, pkgRecords, pkgAlertGroups] = await Promise.all([
    prisma.alert.groupBy({
      by: ["assetId"],
      _count: { id: true },
      _max: { cvssScore: true },
      where: { assetId: { in: allTaggedAssetIds }, status: { in: ["open", "in_progress"] } },
    }),
    prisma.package.findMany({
      where: { name: { in: allTaggedPkgNames } },
      select: { name: true, version: true },
      distinct: ["name", "version"],
    }),
    prisma.alert.groupBy({
      by: ["packageName", "packageVersion"],
      _count: { id: true },
      _max: { cvssScore: true },
      where: { packageName: { in: allTaggedPkgNames }, status: { in: ["open", "in_progress"] } },
    }),
  ])

  const assetAlertMap = new Map(assetAlertGroups.map((g) => [g.assetId, g]))
  const pkgAlertMap = new Map(pkgAlertGroups.map((a) => [`${a.packageName}@${a.packageVersion}`, a]))

  function buildAssetItems(assets: { id: string; name: string; hostname: string; assetType: string }[]) {
    return assets
      .map((a) => {
        const g = assetAlertMap.get(a.id)
        return { id: a.id, name: a.name, hostname: a.hostname, assetType: a.assetType, count: g?._count.id ?? 0, maxCvss: g?._max.cvssScore ?? null }
      })
      .sort((a, b) => (b.maxCvss ?? -1) - (a.maxCvss ?? -1))
  }

  function buildPackageItems(packageNames: string[]) {
    return pkgRecords
      .filter((p) => packageNames.includes(p.name))
      .map((pkg) => {
        const alert = pkgAlertMap.get(`${pkg.name}@${pkg.version}`)
        return { packageName: pkg.name, packageVersion: pkg.version, count: alert?._count.id ?? 0, maxCvss: alert?._max.cvssScore ?? null }
      })
      .sort((a, b) => (b.maxCvss ?? -1) - (a.maxCvss ?? -1))
  }

  const tagData = allTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    type: tag.type,
    color: tag.color,
    assets: tag.type === "asset" ? buildAssetItems(assetsByTagId.get(tag.id) ?? []) : undefined,
    packages: tag.type === "package" ? buildPackageItems([...new Set(pkgNamesByTagId.get(tag.id) ?? [])]) : undefined,
  }))

  return {
    totalAssets,
    totalAlerts,
    openAlerts,
    criticalAlerts,
    recentAlerts,
    trendData,
    topAssetsData,
    topPackagesData,
    kevAlerts,
    productionSeverity: buildTagSeverity(productionAlertRaw),
    developmentSeverity: buildTagSeverity(developmentAlertRaw),
    stagingSeverity: buildTagSeverity(stagingAlertRaw),
    totalPackages,
    todayAlerts,
    tagData,
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const {
    totalAssets,
    totalAlerts,
    openAlerts,
    criticalAlerts,
    recentAlerts,
    trendData,
    topAssetsData,
    topPackagesData,
    kevAlerts,
    productionSeverity,
    developmentSeverity,
    stagingSeverity,
    totalPackages,
    todayAlerts,
    tagData,
  } = await getDashboardData()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <DashboardTabs
        tagsContent={
          <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Each vulnerability count shows open and in-progress alerts only.
          </p>
          {tagData.map(({ id, name, type, color, assets, packages }) => (
            <Card key={id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg font-medium">
                  {color && (
                    <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  )}
                  {name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {type === "package" && <CriticalPackagesCard packages={packages ?? []} />}
                {type === "asset" && <ProductionAssetsCard assets={assets ?? []} />}
              </CardContent>
            </Card>
          ))}
          </>
        }
        overviewContent={<>
        {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalAssets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Packages</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPackages}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalAlerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Alerts</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{openAlerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Alerts</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{criticalAlerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today Alerts</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayAlerts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1: C1 + C2 + C3 — Tag severity */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-block h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: "#16a34a" }} />
              Production Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagSeverityDonut {...productionSeverity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-block h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: "#3b82f6" }} />
              Development Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagSeverityDonut {...developmentSeverity} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-block h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: "#f59e0b" }} />
              Staging Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TagSeverityDonut {...stagingSeverity} />
          </CardContent>
        </Card>
      </div>

      {/* Charts row 3: B1 + B2 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Vulnerable Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <TopAssetsChart data={topAssetsData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Vulnerable Packages</CardTitle>
          </CardHeader>
          <CardContent>
            <TopPackagesChart data={topPackagesData} />
          </CardContent>
        </Card>
      </div>

      {/* New Alerts trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">New Alerts (8 weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertsTrend data={trendData} />
        </CardContent>
      </Card>

      {/* B3: KEV Highlights + Recent Alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        {kevAlerts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">KEV Alerts (Known Exploited)</CardTitle>
            </CardHeader>
            <CardContent>
              <KevHighlights alerts={kevAlerts} />
            </CardContent>
          </Card>
        )}

        {/* Recent Alerts */}
        <Card className={kevAlerts.length === 0 ? "md:col-span-2" : ""}>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
          </CardHeader>
        <CardContent>
          <RecentAlertsClient alerts={recentAlerts} />
        </CardContent>
        </Card>
      </div>
        </>}
      />
    </div>
  )
}
