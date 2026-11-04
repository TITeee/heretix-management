import { prisma } from "@/lib/db"
import { IGNORE_REASONS } from "@/lib/vex"
import type { ReportPeriod } from "./period"

/**
 * What a report counts, read per asset in SQL so that a fleet with hundreds of thousands of
 * alerts is never loaded into memory. Each function returns one row per asset that has
 * something to count; the report adds the rows up for each tag.
 *
 * A status change is read from the alert's events (status_changed, vex_imported), not from the
 * alert's columns: reopening an alert clears resolvedAt, so the columns only say what is true now.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const STATUS_EVENTS = ["status_changed", "vex_imported"]

export type OpenNow = {
  assetId: string
  alerts: number
  kev: number
  critical: number
  malicious: number
  overdue: number
  /** Known exploited and past the due date. */
  kevOverdue: number
  overdueLong: number
  noFix: number
  noFixKev: number
  noFixCritical: number
  /** The earliest due date among the long-overdue findings. */
  oldestDue: Date | null
}

/** The open (open or in progress) findings of each asset as they stand at `now`. */
export async function openNow(now: Date, overdueLongDays: number): Promise<OpenNow[]> {
  const longAgo = new Date(now.getTime() - overdueLongDays * DAY_MS)
  const rows = await prisma.$queryRaw<Record<keyof OpenNow, string | bigint>[]>`
    SELECT "assetId",
      count(*) AS alerts,
      count(*) FILTER (WHERE "isKev") AS kev,
      count(*) FILTER (WHERE "severityTier" = 'critical') AS critical,
      count(*) FILTER (WHERE "externalId" LIKE 'MAL-%') AS malicious,
      count(*) FILTER (WHERE "dueDate" < ${now}) AS overdue,
      count(*) FILTER (WHERE "isKev" AND "dueDate" < ${now}) AS "kevOverdue",
      count(*) FILTER (WHERE "dueDate" < ${longAgo}) AS "overdueLong",
      count(*) FILTER (WHERE "fixedVersion" IS NULL) AS "noFix",
      count(*) FILTER (WHERE "fixedVersion" IS NULL AND "isKev") AS "noFixKev",
      count(*) FILTER (WHERE "fixedVersion" IS NULL AND "severityTier" = 'critical') AS "noFixCritical",
      min("dueDate") FILTER (WHERE "dueDate" < ${longAgo}) AS "oldestDue"
    FROM "Alert"
    WHERE status IN ('open', 'in_progress')
    GROUP BY "assetId"
  `
  return rows.map((r) => ({
    oldestDue: (r.oldestDue as unknown as Date | null) ?? null,
    assetId: String(r.assetId),
    alerts: Number(r.alerts),
    kev: Number(r.kev),
    critical: Number(r.critical),
    malicious: Number(r.malicious),
    overdue: Number(r.overdue),
    kevOverdue: Number(r.kevOverdue),
    overdueLong: Number(r.overdueLong),
    noFix: Number(r.noFix),
    noFixKev: Number(r.noFixKev),
    noFixCritical: Number(r.noFixCritical),
  }))
}

export type NoFixRisk = {
  assetId: string
  /** The source package, or the package when there is none: what a fix would come to. */
  target: string
  fixStatus: string | null
  alerts: number
  kev: number
  critical: number
}

/** Open findings with no fixed version that are known exploited or Critical, per asset, package and fix status. */
export async function noFixRisks(): Promise<NoFixRisk[]> {
  const rows = await prisma.$queryRaw<{ assetId: string; target: string; fixStatus: string | null; alerts: bigint; kev: bigint; critical: bigint }[]>`
    SELECT "assetId", coalesce("sourcePackage", "packageName") AS target, "fixStatus",
      count(*) AS alerts,
      count(*) FILTER (WHERE "isKev") AS kev,
      count(*) FILTER (WHERE "severityTier" = 'critical') AS critical
    FROM "Alert"
    WHERE status IN ('open', 'in_progress') AND "fixedVersion" IS NULL
      AND ("isKev" OR "severityTier" = 'critical')
    GROUP BY 1, 2, 3
  `
  return rows.map((r) => ({ ...r, alerts: Number(r.alerts), kev: Number(r.kev), critical: Number(r.critical) }))
}

export type MaliciousFinding = { assetId: string; packageName: string; packageVersion: string; ecosystem: string; externalId: string }

/** Open findings of a malicious package (OpenSSF's MAL- records). */
export function maliciousOpen(): Promise<MaliciousFinding[]> {
  return prisma.alert.findMany({
    where: { status: { in: ["open", "in_progress"] }, externalId: { startsWith: "MAL-" } },
    select: { assetId: true, packageName: true, packageVersion: true, ecosystem: true, externalId: true },
    orderBy: [{ assetId: "asc" }, { packageName: "asc" }],
  })
}

export type Flows = {
  assetId: string
  /** Findings first detected in the period. */
  detected: number
  /** Findings resolved in the period (each once, however often it was resolved and reopened). */
  resolved: number
  /** Of those, the ones with a due date, and the ones resolved by it. */
  resolvedWithDue: number
  resolvedOnTime: number
  /** Days from detection to resolution, summed, and how many, for Critical and High. */
  daysToResolveCritical: number
  resolvedCritical: number
  daysToResolveHigh: number
  resolvedHigh: number
  /** How many took each time to resolve, in tenths of a day, for Critical and High: [tenths, count]. */
  spreadCritical: [number, number][]
  spreadHigh: [number, number][]
  /** Findings set to accepted risk in the period, and set aside for any other reason. */
  accepted: number
  ignoredOther: number
}

const acceptedLabel = IGNORE_REASONS.accepted_risk

/** What happened in [from, to) to the findings of each asset. */
export async function flows(period: ReportPeriod): Promise<Flows[]> {
  const { from, to } = period
  const [detected, resolved, spread, ignored] = await Promise.all([
    prisma.$queryRaw<{ assetId: string; n: bigint }[]>`
      SELECT "assetId", count(*) AS n FROM "Alert"
      WHERE "detectedAt" >= ${from} AND "detectedAt" < ${to}
      GROUP BY "assetId"
    `,
    // The last resolution in the period of each alert, against its detection and due date.
    prisma.$queryRaw<Record<string, string | bigint | number | null>[]>`
      WITH r AS (
        SELECT DISTINCT ON (e."alertId") e."alertId", e."createdAt" AS at
        FROM "AlertEvent" e
        WHERE e.type = ANY(${STATUS_EVENTS}) AND e.data->>'to' = 'resolved'
          AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
        ORDER BY e."alertId", e."createdAt" DESC
      )
      SELECT a."assetId",
        count(*) AS resolved,
        count(*) FILTER (WHERE a."dueDate" IS NOT NULL) AS "withDue",
        count(*) FILTER (WHERE a."dueDate" IS NOT NULL AND r.at <= a."dueDate") AS "onTime",
        coalesce(sum(extract(epoch FROM r.at - a."detectedAt")) FILTER (WHERE a."severityTier" = 'critical'), 0) AS "secCritical",
        count(*) FILTER (WHERE a."severityTier" = 'critical') AS "nCritical",
        coalesce(sum(extract(epoch FROM r.at - a."detectedAt")) FILTER (WHERE a."severityTier" = 'high'), 0) AS "secHigh",
        count(*) FILTER (WHERE a."severityTier" = 'high') AS "nHigh"
      FROM r JOIN "Alert" a ON a.id = r."alertId"
      GROUP BY a."assetId"
    `,
    // The same resolutions counted by time to resolve, for the median: a mean cannot be added
    // up across assets into a median, but these counts can.
    prisma.$queryRaw<{ assetId: string; tier: string; tenths: number; n: bigint }[]>`
      WITH r AS (
        SELECT DISTINCT ON (e."alertId") e."alertId", e."createdAt" AS at
        FROM "AlertEvent" e
        WHERE e.type = ANY(${STATUS_EVENTS}) AND e.data->>'to' = 'resolved'
          AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
        ORDER BY e."alertId", e."createdAt" DESC
      )
      SELECT a."assetId", a."severityTier" AS tier,
        round(extract(epoch FROM r.at - a."detectedAt") / 8640)::int AS tenths, count(*) AS n
      FROM r JOIN "Alert" a ON a.id = r."alertId"
      WHERE a."severityTier" IN ('critical', 'high')
      GROUP BY 1, 2, 3
    `,
    // Set aside in the period: accepted risk by the status change that set it, or by a later
    // change of reason (that event stores the reason's label, not its key).
    prisma.$queryRaw<{ assetId: string; accepted: bigint; other: bigint }[]>`
      WITH i AS (
        SELECT e."alertId",
          bool_or(
            (e.type = ANY(${STATUS_EVENTS}) AND e.data->>'ignoreReason' = 'accepted_risk')
            OR (e.type = 'ignore_reason_changed' AND e.data->>'to' = ${acceptedLabel})
          ) AS accepted
        FROM "AlertEvent" e
        WHERE e."createdAt" >= ${from} AND e."createdAt" < ${to}
          AND ((e.type = ANY(${STATUS_EVENTS}) AND e.data->>'to' = 'ignored') OR e.type = 'ignore_reason_changed')
        GROUP BY e."alertId"
      )
      SELECT a."assetId",
        count(*) FILTER (WHERE i.accepted) AS accepted,
        count(*) FILTER (WHERE NOT i.accepted) AS other
      FROM i JOIN "Alert" a ON a.id = i."alertId"
      GROUP BY a."assetId"
    `,
  ])

  const byAsset = new Map<string, Flows>()
  const row = (assetId: string) => {
    let f = byAsset.get(assetId)
    if (!f) {
      f = {
        assetId, detected: 0, resolved: 0, resolvedWithDue: 0, resolvedOnTime: 0,
        daysToResolveCritical: 0, resolvedCritical: 0, daysToResolveHigh: 0, resolvedHigh: 0,
        spreadCritical: [], spreadHigh: [],
        accepted: 0, ignoredOther: 0,
      }
      byAsset.set(assetId, f)
    }
    return f
  }
  for (const d of detected) row(d.assetId).detected = Number(d.n)
  for (const r of resolved) {
    const f = row(String(r.assetId))
    f.resolved = Number(r.resolved)
    f.resolvedWithDue = Number(r.withDue)
    f.resolvedOnTime = Number(r.onTime)
    f.daysToResolveCritical = Number(r.secCritical) / 86400
    f.resolvedCritical = Number(r.nCritical)
    f.daysToResolveHigh = Number(r.secHigh) / 86400
    f.resolvedHigh = Number(r.nHigh)
  }
  for (const s of spread) {
    const f = row(s.assetId)
    const counts = s.tier === "critical" ? f.spreadCritical : f.spreadHigh
    counts.push([Number(s.tenths), Number(s.n)])
  }
  for (const i of ignored) {
    const f = row(i.assetId)
    f.accepted = Number(i.accepted)
    f.ignoredOther = Number(i.other)
  }
  return [...byAsset.values()]
}

export type OpenAt = {
  assetId: string
  point: number
  open: number
  /** Of those, the ones past their due date at the point (the due date as it is now). */
  overdue: number
  /** Of those, the ones detected over `agedDays` before the point. */
  aged: number
}

/**
 * How many findings of each asset were open (open or in progress) at each of `points`.
 *
 * Every alert is open from its detection until its first status event; each status event then
 * holds until the next. An alert with no status events at all (from before they were recorded)
 * is open until resolvedAt, or updatedAt when it is set aside without one, which is the closest
 * the columns can say.
 */
export async function openAt(points: Date[], agedDays: number): Promise<OpenAt[]> {
  if (points.length === 0) return []
  // Columns hold UTC without a zone; a zone in the text is ignored by the cast, leaving UTC.
  const isoPoints = points.map((p) => p.toISOString())
  const rows = await prisma.$queryRaw<{ assetId: string; i: bigint; open: bigint; overdue: bigint; aged: bigint }[]>`
    WITH pts AS (
      SELECT t, i FROM unnest(${isoPoints}::timestamp[]) WITH ORDINALITY AS x(t, i)
    ),
    ev AS (
      SELECT e."alertId", e."createdAt" AS since, e.data->>'to' AS st,
        lead(e."createdAt") OVER (PARTITION BY e."alertId" ORDER BY e."createdAt", e.id) AS until
      FROM "AlertEvent" e
      WHERE e.type = ANY(${STATUS_EVENTS}) AND e.data ? 'to'
    ),
    first_ev AS (
      SELECT "alertId", min(since) AS at FROM ev GROUP BY "alertId"
    ),
    segs AS (
      SELECT a."assetId", a."detectedAt" AS since,
        coalesce(f.at, CASE WHEN a.status IN ('open', 'in_progress') THEN NULL ELSE coalesce(a."resolvedAt", a."updatedAt") END) AS until,
        'open' AS st, a."dueDate" AS due, a."detectedAt" AS detected
      FROM "Alert" a LEFT JOIN first_ev f ON f."alertId" = a.id
      UNION ALL
      SELECT a."assetId", ev.since, ev.until, ev.st, a."dueDate", a."detectedAt"
      FROM ev JOIN "Alert" a ON a.id = ev."alertId"
    )
    SELECT s."assetId", p.i, count(*) AS open,
      count(*) FILTER (WHERE s.due < p.t) AS overdue,
      count(*) FILTER (WHERE s.detected < p.t - make_interval(days => ${agedDays}::int)) AS aged
    FROM segs s JOIN pts p ON s.since <= p.t AND (s.until IS NULL OR s.until > p.t)
    WHERE s.st IN ('open', 'in_progress')
    GROUP BY s."assetId", p.i
  `
  return rows.map((r) => ({ assetId: r.assetId, point: Number(r.i) - 1, open: Number(r.open), overdue: Number(r.overdue), aged: Number(r.aged) }))
}

export type AcceptedRisk = {
  assetId: string
  packageName: string
  sourcePackage: string | null
  isKev: boolean
  critical: boolean
  /** The latest acceptance: when, by whom and the reason given, when recorded. */
  acceptedAt: Date | null
  acceptedBy: string | null
  reason: string | null
}

/** The findings now set aside as accepted risk that are known exploited or Critical. */
export async function acceptedRisks(): Promise<AcceptedRisk[]> {
  const rows = await prisma.$queryRaw<(Omit<AcceptedRisk, "critical"> & { tier: string | null })[]>`
    SELECT a."assetId", a."packageName", a."sourcePackage", a."isKev", a."severityTier" AS tier,
      acc.at AS "acceptedAt", acc.who AS "acceptedBy", acc.reason
    FROM "Alert" a
    LEFT JOIN LATERAL (
      SELECT e."createdAt" AS at, e.data->>'userName' AS who, e.data->>'reason' AS reason
      FROM "AlertEvent" e
      WHERE e."alertId" = a.id AND (
        (e.type = ANY(${STATUS_EVENTS}) AND e.data->>'to' = 'ignored' AND e.data->>'ignoreReason' = 'accepted_risk')
        OR (e.type = 'ignore_reason_changed' AND e.data->>'to' = ${acceptedLabel})
      )
      ORDER BY e."createdAt" DESC
      LIMIT 1
    ) acc ON true
    WHERE a.status = 'ignored' AND a."ignoreReason" = 'accepted_risk'
      AND (a."isKev" OR a."severityTier" = 'critical')
  `
  return rows.map(({ tier, ...r }) => ({ ...r, critical: tier === "critical" }))
}
