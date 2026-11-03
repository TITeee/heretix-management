import { prisma } from "@/lib/db"
import { loadOpenPlan } from "@/lib/remediation-data"
import type { RemediationAction, RemediationKind, RemediationPlan } from "@/lib/remediation"
import { getScanStatuses } from "@/lib/scan-status"
import {
  acceptedRisks, flows, maliciousOpen, noFixRisks, openAt, openNow,
  type Flows, type OpenNow,
} from "./history"
import { previousPeriod, trendPoints, type ReportPeriod } from "./period"

/**
 * The executive summary: where the fleet stands now, what happened in the period and the one
 * before it, and what needs a decision, for all assets and for each chosen asset tag.
 *
 * The headline unit is a change to make (the Remediation tab's groups), since one kernel
 * update can stand for thousands of findings. A change can only be worked out from the
 * findings as they are now, so the trend and the comparison with the previous period count
 * findings instead.
 */

/** A finding this far past its due date is listed as needing a decision. */
export const OVERDUE_LONG_DAYS = 30
/** An asset not scanned for this long is listed as having a gap. */
export const SCAN_STALE_DAYS = 7
/** The default tag marking assets exposed to the internet (prisma/seed.ts). */
export const INTERNET_FACING_TAG = "Internet Facing"

const DAY_MS = 24 * 60 * 60 * 1000
const LIST_LIMIT = 10
const TOP_ASSETS = 5
const PLAN_CONCURRENCY = 4

export type ScopeKind = "all" | "tag" | "untagged"

export type PeriodNumbers = {
  detected: number
  resolved: number
  resolvedWithDue: number
  resolvedOnTime: number
  /** Share of the findings resolved in the period that met their due date; null with none. */
  onTimeRate: number | null
  /** Mean days from detection to resolution; null when none was resolved. */
  mttrCriticalDays: number | null
  mttrHighDays: number | null
  accepted: number
  ignoredOther: number
}

export type ScopeNumbers = {
  key: string
  kind: ScopeKind
  label: string
  assets: number
  open: { alerts: number; kev: number; critical: number; malicious: number; overdue: number; overdueLong: number }
  fixes: { changes: number; alerts: number; kevChanges: number; kevAlerts: number }
  noFix: { alerts: number; kev: number; critical: number }
  period: PeriodNumbers
  previous: PeriodNumbers
  /** Open findings at each of ExecutiveReport.trendPoints. */
  trend: number[]
}

export type ChangeToMake = { kind: RemediationKind; target: string; version: string | null; alerts: number; kev: number }

type AssetRef = { assetId: string; assetName: string }

export type ExecutiveReport = {
  generatedAt: Date
  period: ReportPeriod
  previousPeriod: ReportPeriod
  trendPoints: Date[]
  /** When finding metadata (CVSS, EPSS, KEV) was last refreshed from heretix-api. */
  lastMetadataRefresh: Date | null
  /** The tags whose assets the report covers; empty when it covers every asset. */
  tags: { id: string; name: string }[]
  /** The assets covered first, then each tag (and, covering every asset, the assets with none). */
  scopes: ScopeNumbers[]
  decisions: {
    noFix: { total: number; rows: (AssetRef & { target: string; fixStatus: string | null; alerts: number; kev: number; critical: number })[] }
    longOverdue: { total: number; rows: (AssetRef & { alerts: number; oldestDue: Date | null })[] }
    scanGaps: { total: number; rows: (AssetRef & { inventoryAt: Date | null; lastScanAt: Date | null; lastScanFailed: boolean })[] }
    malicious: { total: number; rows: (AssetRef & { packageName: string; packageVersion: string; ecosystem: string; externalId: string })[] }
  }
  internetFacing: {
    tagFound: boolean
    assets: number
    kev: number
    critical: number
    rows: (AssetRef & { kev: number; critical: number; alerts: number; changes: number; firstChange: ChangeToMake | null })[]
  }
  acceptedRisks: {
    total: number
    rows: (AssetRef & { target: string; alerts: number; kev: number; critical: number; acceptedAt: Date | null; acceptedBy: string | null; reason: string | null })[]
  }
  topAssets: (AssetRef & { kev: number; critical: number; alerts: number; changes: number; firstChange: ChangeToMake | null })[]
}

type AssetInfo = { id: string; name: string; scannedAt: Date | null; sbomTool: string | null; tagIds: string[] }

function emptyPeriod(): PeriodNumbers {
  return { detected: 0, resolved: 0, resolvedWithDue: 0, resolvedOnTime: 0, onTimeRate: null, mttrCriticalDays: null, mttrHighDays: null, accepted: 0, ignoredOther: 0 }
}

/** Adds the flows of the scope's assets up; rates and means are taken over the sums. */
export function sumFlows(rows: Flows[]): PeriodNumbers {
  const p = emptyPeriod()
  let daysCritical = 0, nCritical = 0, daysHigh = 0, nHigh = 0
  for (const f of rows) {
    p.detected += f.detected
    p.resolved += f.resolved
    p.resolvedWithDue += f.resolvedWithDue
    p.resolvedOnTime += f.resolvedOnTime
    p.accepted += f.accepted
    p.ignoredOther += f.ignoredOther
    daysCritical += f.daysToResolveCritical
    nCritical += f.resolvedCritical
    daysHigh += f.daysToResolveHigh
    nHigh += f.resolvedHigh
  }
  p.onTimeRate = p.resolvedWithDue > 0 ? p.resolvedOnTime / p.resolvedWithDue : null
  p.mttrCriticalDays = nCritical > 0 ? daysCritical / nCritical : null
  p.mttrHighDays = nHigh > 0 ? daysHigh / nHigh : null
  return p
}

export function firstChange(plan: RemediationPlan | undefined): ChangeToMake | null {
  // Actions come most urgent first (KEV, then severity), as on the Remediation tab.
  const a: RemediationAction | undefined = plan?.actions[0]
  if (!a) return null
  return { kind: a.kind, target: a.target, version: a.upgradeTo[0]?.version ?? null, alerts: a.alertIds.length, kev: a.kev }
}

async function loadPlans(assetIds: string[]): Promise<Map<string, RemediationPlan>> {
  const plans = new Map<string, RemediationPlan>()
  let next = 0
  const worker = async () => {
    while (next < assetIds.length) {
      const id = assetIds[next++]
      plans.set(id, await loadOpenPlan(id))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PLAN_CONCURRENCY, assetIds.length) }, worker))
  return plans
}

/**
 * tagIds: the asset tags whose assets the report covers, an asset carrying any of them; every
 * asset when empty.
 */
export async function buildExecutiveReport(options: { period: ReportPeriod; tagIds: string[]; now?: Date }): Promise<ExecutiveReport> {
  const now = options.now ?? new Date()
  const period = options.period
  const previous = previousPeriod(period)
  const points = trendPoints(period, now)

  const [assetRows, tags, openRows, periodRows, previousRows, openCountRows, scanStatuses, refresh, noFixRead, maliciousRead, acceptedRead] = await Promise.all([
    prisma.asset.findMany({
      select: { id: true, name: true, scannedAt: true, sbomTool: true, assetTags: { select: { tagId: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({ where: { type: "asset" }, select: { id: true, name: true, isDefault: true }, orderBy: { name: "asc" } }),
    openNow(now, OVERDUE_LONG_DAYS),
    flows(period),
    flows(previous),
    openAt(points),
    getScanStatuses(),
    prisma.metadataRefreshRun.findFirst({ orderBy: { executedAt: "desc" }, select: { executedAt: true } }),
    noFixRisks(),
    maliciousOpen(),
    acceptedRisks(),
  ])

  const everyAsset: AssetInfo[] = assetRows.map((a) => ({ id: a.id, name: a.name, scannedAt: a.scannedAt, sbomTool: a.sbomTool, tagIds: a.assetTags.map((t) => t.tagId) }))

  // The assets covered: those carrying any chosen tag, or all of them. The reads above are
  // fleet-wide; every number and list below is taken from the covered assets' rows alone.
  const chosen = tags.filter((t) => options.tagIds.includes(t.id))
  const filtered = chosen.length > 0
  const assets = filtered ? everyAsset.filter((a) => chosen.some((t) => a.tagIds.includes(t.id))) : everyAsset
  const covered = new Set(assets.map((a) => a.id))
  const only = <T extends { assetId: string }>(rows: T[]) => filtered ? rows.filter((r) => covered.has(r.assetId)) : rows
  const open = only(openRows)
  const periodFlows = only(periodRows)
  const previousFlows = only(previousRows)
  const openCounts = only(openCountRows)
  const noFix = only(noFixRead)
  const malicious = only(maliciousRead)
  const accepted = only(acceptedRead)
  const nameOf = new Map(assets.map((a) => [a.id, a.name]))
  const ref = (assetId: string): AssetRef => ({ assetId, assetName: nameOf.get(assetId) ?? assetId })
  const openBy = new Map(open.map((o) => [o.assetId, o]))
  const plans = await loadPlans(open.map((o) => o.assetId))

  // Scopes: the assets covered, then each tag: the chosen ones, or every asset tag and the
  // assets with none.
  const tagScope = (t: { id: string; name: string }) =>
    ({ key: `tag:${t.id}`, kind: "tag" as const, label: t.name, assetIds: new Set(assets.filter((a) => a.tagIds.includes(t.id)).map((a) => a.id)) })
  const scopeDefs: { key: string; kind: ScopeKind; label: string; assetIds: Set<string> }[] = filtered
    ? [{ key: "all", kind: "all", label: "Selected assets", assetIds: covered }, ...chosen.map(tagScope)]
    : [
        { key: "all", kind: "all", label: "All assets", assetIds: covered },
        ...tags.map(tagScope),
        { key: "untagged", kind: "untagged", label: "No tag", assetIds: new Set(assets.filter((a) => a.tagIds.length === 0).map((a) => a.id)) },
      ]

  const scopes: ScopeNumbers[] = scopeDefs.map(({ key, kind, label, assetIds }) => {
    const inScope = <T extends { assetId: string }>(rows: T[]) => rows.filter((r) => assetIds.has(r.assetId))
    const o = inScope(open)
    const sum = (pick: (r: OpenNow) => number) => o.reduce((n, r) => n + pick(r), 0)
    const fixes = { changes: 0, alerts: 0, kevChanges: 0, kevAlerts: 0 }
    for (const id of assetIds) {
      for (const a of plans.get(id)?.actions ?? []) {
        fixes.changes++
        fixes.alerts += a.alertIds.length
        if (a.kev > 0) fixes.kevChanges++
        fixes.kevAlerts += a.kev
      }
    }
    const trend = points.map(() => 0)
    for (const c of inScope(openCounts)) trend[c.point] += c.open
    return {
      key, kind, label,
      assets: assetIds.size,
      open: {
        alerts: sum((r) => r.alerts), kev: sum((r) => r.kev), critical: sum((r) => r.critical),
        malicious: sum((r) => r.malicious), overdue: sum((r) => r.overdue), overdueLong: sum((r) => r.overdueLong),
      },
      fixes,
      noFix: { alerts: sum((r) => r.noFix), kev: sum((r) => r.noFixKev), critical: sum((r) => r.noFixCritical) },
      period: sumFlows(inScope(periodFlows)),
      previous: sumFlows(inScope(previousFlows)),
      trend,
    }
  })

  // Decisions: no fix for something exploited or Critical, long overdue, scan gaps, malware.
  const byRisk = <T extends { kev: number; critical: number; alerts: number }>(a: T, b: T) =>
    b.kev - a.kev || b.critical - a.critical || b.alerts - a.alerts
  const noFixRows = noFix.map((r) => ({ ...ref(r.assetId), target: r.target, fixStatus: r.fixStatus, alerts: r.alerts, kev: r.kev, critical: r.critical })).sort(byRisk)
  const overdueRows = open
    .filter((o) => o.overdueLong > 0)
    .map((o) => ({ ...ref(o.assetId), alerts: o.overdueLong, oldestDue: o.oldestDue }))
    .sort((a, b) => b.alerts - a.alerts)
  const staleBefore = new Date(now.getTime() - SCAN_STALE_DAYS * DAY_MS)
  const gapRows = assets.flatMap((a) => {
    const status = scanStatuses.get(a.id)
    const lastScanAt = status?.lastSuccessAt ?? null
    const lastScanFailed = status?.lastAttempt?.failed ?? false
    // An inventory only goes stale when it is collected (an SBOM); a product added by hand has none.
    const inventoryStale = a.sbomTool != null && (a.scannedAt == null || a.scannedAt < staleBefore)
    const scanStale = lastScanAt == null || lastScanAt < staleBefore
    return inventoryStale || scanStale || lastScanFailed
      ? [{ ...ref(a.id), inventoryAt: a.scannedAt, lastScanAt, lastScanFailed }]
      : []
  })

  // Internet facing: the assets carrying the default tag.
  const internetTag = tags.find((t) => t.isDefault && t.name === INTERNET_FACING_TAG)
  const exposed = internetTag ? assets.filter((a) => a.tagIds.includes(internetTag.id)) : []
  const assetSummary = (assetId: string) => {
    const o = openBy.get(assetId)
    const plan = plans.get(assetId)
    return { ...ref(assetId), kev: o?.kev ?? 0, critical: o?.critical ?? 0, alerts: o?.alerts ?? 0, changes: plan?.actions.length ?? 0, firstChange: firstChange(plan) }
  }
  const exposedRows = exposed.map((a) => assetSummary(a.id)).filter((r) => r.kev > 0 || r.critical > 0).sort(byRisk)

  // Accepted risks, one row per asset and package.
  const acceptedGroups = new Map<string, ExecutiveReport["acceptedRisks"]["rows"][number]>()
  for (const r of accepted) {
    const target = r.sourcePackage ?? r.packageName
    const key = `${r.assetId}\u0000${target}`
    let g = acceptedGroups.get(key)
    if (!g) {
      g = { ...ref(r.assetId), target, alerts: 0, kev: 0, critical: 0, acceptedAt: null, acceptedBy: null, reason: null }
      acceptedGroups.set(key, g)
    }
    g.alerts++
    if (r.isKev) g.kev++
    if (r.critical) g.critical++
    if (r.acceptedAt && (!g.acceptedAt || r.acceptedAt > g.acceptedAt)) {
      g.acceptedAt = r.acceptedAt
      g.acceptedBy = r.acceptedBy
      g.reason = r.reason
    }
  }
  const acceptedRows = [...acceptedGroups.values()].sort(byRisk)

  const topAssets = open
    .map((o) => assetSummary(o.assetId))
    .sort(byRisk)
    .slice(0, TOP_ASSETS)

  return {
    generatedAt: now,
    period,
    previousPeriod: previous,
    trendPoints: points,
    lastMetadataRefresh: refresh?.executedAt ?? null,
    tags: chosen.map((t) => ({ id: t.id, name: t.name })),
    scopes,
    decisions: {
      noFix: { total: noFixRows.length, rows: noFixRows.slice(0, LIST_LIMIT) },
      longOverdue: { total: overdueRows.length, rows: overdueRows.slice(0, LIST_LIMIT) },
      scanGaps: { total: gapRows.length, rows: gapRows.slice(0, LIST_LIMIT) },
      malicious: { total: malicious.length, rows: malicious.slice(0, LIST_LIMIT).map((m) => ({ ...ref(m.assetId), ...m })) },
    },
    internetFacing: {
      tagFound: internetTag != null,
      assets: exposed.length,
      kev: exposedRows.reduce((n, r) => n + r.kev, 0),
      critical: exposedRows.reduce((n, r) => n + r.critical, 0),
      rows: exposedRows.slice(0, LIST_LIMIT),
    },
    acceptedRisks: { total: acceptedRows.length, rows: acceptedRows.slice(0, LIST_LIMIT) },
    topAssets,
  }
}
