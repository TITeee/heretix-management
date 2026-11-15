/**
 * The dashboard's counts, computed by the database. The page used to read every open
 * alert (and every resolved one, for the time to resolve) and count them here: with
 * 1.7 million alerts that took 14 s and pushed the app to its 2 GB heap. These give the
 * same numbers from GROUP BY and COUNT, on the stored severity tier (Alert.severityTier,
 * which the database derives with getAlertSeverityTier's rule).
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { emptySeverityCounts, type SeverityCounts, type SeverityTier } from "@/lib/severity"

const TIERS: SeverityTier[] = ["critical", "high", "medium", "low", "na"]
const ACTIVE = { status: { in: ["open", "in_progress"] } } satisfies Prisma.AlertWhereInput

function asTier(value: string | null): SeverityTier {
  return (TIERS as string[]).includes(value ?? "") ? (value as SeverityTier) : "na"
}

/** Open and in-progress alerts per severity tier, among those `where` selects. */
export async function activeSeverityCounts(where: Prisma.AlertWhereInput = {}): Promise<SeverityCounts> {
  const groups = await prisma.alert.groupBy({ by: ["severityTier"], where: { AND: [ACTIVE, where] }, _count: { _all: true } })
  const counts = emptySeverityCounts()
  for (const g of groups) counts[asTier(g.severityTier)] += g._count._all
  return counts
}

/** Open alerts per asset and tier, for every asset that has any. */
export async function activeSeverityByAsset(): Promise<Map<string, SeverityCounts>> {
  const groups = await prisma.alert.groupBy({ by: ["assetId", "severityTier"], where: ACTIVE, _count: { _all: true } })
  const byAsset = new Map<string, SeverityCounts>()
  for (const g of groups) {
    const counts = byAsset.get(g.assetId) ?? emptySeverityCounts()
    counts[asTier(g.severityTier)] += g._count._all
    byAsset.set(g.assetId, counts)
  }
  return byAsset
}

export type AssetSeverityRow = SeverityCounts & { name: string }

/**
 * Open alerts per asset and tier: the ten assets with the most, and the tiers over all
 * assets (the same alerts, so the Critical card and the chart agree).
 */
export async function activeAlertsByAsset(top = 10): Promise<{ topAssets: AssetSeverityRow[]; overall: SeverityCounts }> {
  const byAsset = await activeSeverityByAsset()
  const overall = emptySeverityCounts()
  for (const counts of byAsset.values()) for (const t of TIERS) overall[t] += counts[t]
  const total = (c: SeverityCounts) => c.critical + c.high + c.medium + c.low + c.na
  const ranked = [...byAsset].sort((a, b) => total(b[1]) - total(a[1])).slice(0, top)
  const assets = await prisma.asset.findMany({ where: { id: { in: ranked.map(([id]) => id) } }, select: { id: true, name: true, hostname: true } })
  const label = new Map(assets.map((a) => [a.id, a.name || a.hostname]))
  return { topAssets: ranked.map(([id, c]) => ({ name: label.get(id) ?? "", ...c })), overall }
}

/** How many alerts have `field` in each week that starts on one of `starts` (local Mondays). */
export async function weeklyCounts(field: "detectedAt" | "resolvedAt", starts: Date[]): Promise<number[]> {
  return Promise.all(starts.map((start, i) => {
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const upTo = starts[i + 1] ?? end
    return prisma.alert.count({ where: { [field]: { gte: start, lt: upTo } } })
  }))
}

export type SlaStatusLabel = "Overdue" | "Urgent" | "Warning" | "OK" | "Unscored"

/** Open alerts per SLA status (lib/sla.ts getSlaStatus) and tier, at `now`. */
export async function activeSlaCounts(now: Date = new Date()): Promise<(SeverityCounts & { status: SlaStatusLabel })[]> {
  const hour24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const ranges: [SlaStatusLabel, Prisma.AlertWhereInput][] = [
    ["Overdue", { dueDate: { lt: now } }],
    ["Urgent", { dueDate: { gte: now, lt: hour24 } }],
    ["Warning", { dueDate: { gte: hour24, lt: day7 } }],
    ["OK", { dueDate: { gte: day7 } }],
    ["Unscored", { dueDate: null }],
  ]
  return Promise.all(ranges.map(async ([status, where]) => ({ status, ...(await activeSeverityCounts(where)) })))
}

export type MttrTierLabel = "Critical" | "High" | "Medium" | "Low" | "N/A"
const MTTR_LABEL: Record<SeverityTier, MttrTierLabel> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", na: "N/A" }

/** Resolved alerts per tier, with the average days from detection to resolution. */
export async function mttrByTier(): Promise<{ tier: MttrTierLabel; avgDays: number; count: number }[]> {
  const rows = await prisma.$queryRaw<{ tier: string | null; count: bigint; avgDays: number | null }[]>`
    SELECT "severityTier" AS tier, count(*) AS count,
           avg(EXTRACT(EPOCH FROM ("resolvedAt" - "detectedAt")) / 86400.0)::float8 AS "avgDays"
    FROM "Alert"
    WHERE status = 'resolved' AND "resolvedAt" IS NOT NULL
    GROUP BY "severityTier"`
  const byTier = new Map<SeverityTier, { count: number; sum: number }>()
  for (const r of rows) {
    const t = asTier(r.tier)
    const prev = byTier.get(t) ?? { count: 0, sum: 0 }
    const n = Number(r.count)
    byTier.set(t, { count: prev.count + n, sum: prev.sum + (r.avgDays ?? 0) * n })
  }
  return TIERS.map((t) => {
    const v = byTier.get(t)
    return { tier: MTTR_LABEL[t], avgDays: v && v.count > 0 ? v.sum / v.count : 0, count: v?.count ?? 0 }
  })
}
