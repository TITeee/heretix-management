/**
 * The Alerts list, one page at a time, filtered, grouped and sorted in SQL.
 *
 * It answers the same question the browser used to answer over every alert
 * (lib/alerts/list-filters.ts, kept as the reference;
 * lib/alerts/query.integration.test.ts compares the two), with two agreed
 * differences: picking both "direct" and "indirect" shows either, not neither,
 * and the package search matches any package of a grouped row, not only the
 * one shown.
 *
 * A row is a finding: the alerts of one asset that share a source package,
 * version and vulnerability (Alert.findingKey), shown through the one whose
 * package name sorts first. Filters apply to alerts before they are grouped,
 * so a row lists only the alerts that match.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { Alert } from "@/lib/alerts/list-filters"
import { NONE, type AlertQuery, type SortColumn } from "@/lib/alerts/query-params"

const HOUR_MS = 60 * 60 * 1000

// Escapes LIKE's wildcards so a search for "_" or "%" finds itself.
function contains(s: string): string {
  return `%${s.replace(/[\\%_]/g, "\\$&")}%`
}

function inList(values: string[]): Prisma.Sql {
  return Prisma.join(values.map((v) => Prisma.sql`${v}`))
}

// The package an alert is on, in the asset's current inventory (none when it is not).
const PACKAGE_MATCH = Prisma.sql`p."assetId" = a."assetId" AND p."name" = a."packageName" AND p."version" = a."packageVersion"`

/** Conditions on one alert (table alias `a`), every filter but the searches. */
export function alertConditions(q: AlertQuery, now: Date): Prisma.Sql[] {
  const c: Prisma.Sql[] = []
  if (q.assetIds.length) c.push(Prisma.sql`a."assetId" IN (${inList(q.assetIds)})`)
  if (q.statuses.length) c.push(Prisma.sql`a."status" IN (${inList(q.statuses)})`)
  if (q.packageName) c.push(Prisma.sql`a."packageName" = ${q.packageName}`)
  if (q.packageVersion) c.push(Prisma.sql`a."packageVersion" = ${q.packageVersion}`)
  if (q.severityTiers.length) c.push(Prisma.sql`a."severityTier" IN (${inList(q.severityTiers)})`)
  if (q.risks.length) {
    const r: Prisma.Sql[] = []
    if (q.risks.includes("kev")) r.push(Prisma.sql`a."isKev"`)
    if (q.risks.includes("malware")) r.push(Prisma.sql`a."externalId" LIKE 'MAL-%'`)
    c.push(Prisma.sql`(${Prisma.join(r, " OR ")})`)
  }
  if (q.ecosystems.length) c.push(Prisma.sql`a."ecosystem" IN (${inList(q.ecosystems)})`)
  if (q.sources.length) c.push(Prisma.sql`a."sources" && ARRAY[${inList(q.sources)}]::text[]`)
  if (q.tagIds.length) {
    c.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM "AssetTag" t WHERE t."assetId" = a."assetId" AND t."tagId" IN (${inList(q.tagIds)}))
      OR EXISTS (SELECT 1 FROM "PackageTag" t WHERE t."packageName" = a."packageName" AND t."tagId" IN (${inList(q.tagIds)}))
    )`)
  }
  if (q.dependencies.length) {
    const want = q.dependencies.map((d) => d === "direct")
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM "Package" p WHERE ${PACKAGE_MATCH} AND p."direct" IN (${Prisma.join(want)}))`)
  }
  if (q.inventories.length === 1) {
    c.push(q.inventories[0] === "present"
      ? Prisma.sql`EXISTS (SELECT 1 FROM "Package" p WHERE ${PACKAGE_MATCH})`
      : Prisma.sql`NOT EXISTS (SELECT 1 FROM "Package" p WHERE ${PACKAGE_MATCH})`)
  }
  if (q.dues.length) {
    // getSlaStatus (lib/sla.ts), as ranges of the due date.
    const in24h = new Date(now.getTime() + 24 * HOUR_MS)
    const in7d = new Date(now.getTime() + 7 * 24 * HOUR_MS)
    const d: Prisma.Sql[] = q.dues.map((due) => {
      switch (due) {
        case "overdue": return Prisma.sql`a."dueDate" < ${now}`
        case "urgent": return Prisma.sql`(a."dueDate" >= ${now} AND a."dueDate" < ${in24h})`
        case "warning": return Prisma.sql`(a."dueDate" >= ${in24h} AND a."dueDate" < ${in7d})`
        case "ok": return Prisma.sql`a."dueDate" >= ${in7d}`
        case "unscored": return Prisma.sql`a."dueDate" IS NULL`
      }
    })
    c.push(Prisma.sql`(${Prisma.join(d, " OR ")})`)
  }
  if (q.distroLabels.length) {
    const labels = q.distroLabels.filter((l) => l !== NONE)
    const d: Prisma.Sql[] = []
    if (labels.length) d.push(Prisma.sql`a."distroLabel" IN (${inList(labels)})`)
    if (q.distroLabels.includes(NONE)) d.push(Prisma.sql`a."distroLabel" IS NULL`)
    c.push(Prisma.sql`(${Prisma.join(d, " OR ")})`)
  }
  if (q.fixStatuses.length) {
    const statuses = q.fixStatuses.filter((s) => s !== NONE)
    const d: Prisma.Sql[] = []
    if (statuses.length) d.push(Prisma.sql`a."fixStatus" IN (${inList(statuses)})`)
    if (q.fixStatuses.includes(NONE)) d.push(Prisma.sql`(a."fixStatus" IS NULL OR a."fixStatus" = '')`)
    c.push(Prisma.sql`(${Prisma.join(d, " OR ")})`)
  }
  return c
}

// The distro an alert's rating is on, and the rating's rank on that distro's
// scale (lib/distro-priority.ts distroPrioritySortKey); null when unrated.
const DISTRO_NAME = Prisma.sql`(CASE WHEN r."ecosystem" = 'advisory' THEN 'Microsoft' ELSE btrim(split_part(r."ecosystem", ':', 1)) END)`
const DISTRO_RANK = Prisma.sql`(CASE ${DISTRO_NAME}
  WHEN 'Ubuntu' THEN array_position(ARRAY['negligible','low','medium','high','critical'], lower(r."distroPriority"))
  WHEN 'Debian' THEN array_position(ARRAY['unimportant','low','medium','high'], lower(r."distroPriority"))
  WHEN 'Red Hat' THEN array_position(ARRAY['low','moderate','important','critical'], lower(r."distroPriority"))
  WHEN 'Microsoft' THEN array_position(ARRAY['low','moderate','important','critical'], lower(r."distroPriority"))
END)`
// fixStatusSortKey (lib/fix-status.ts): an unknown status ranks as "affected".
const FIX_RANK = Prisma.sql`(CASE WHEN r."fixStatus" IS NULL OR r."fixStatus" = '' THEN NULL
  ELSE COALESCE(array_position(ARRAY['under_investigation','affected','deferred','will_not_fix','out_of_support'], r."fixStatus"), 2) END)`

/** ORDER BY for a row's representative alert (alias `r`); missing values last either way. */
function orderBy(column: SortColumn, desc: boolean): Prisma.Sql {
  const dir = desc ? Prisma.sql`DESC` : Prisma.sql`ASC`
  const nullsLast = (expr: Prisma.Sql) => Prisma.sql`${expr} ${dir} NULLS LAST`
  let primary: Prisma.Sql
  switch (column) {
    case "distroPriority":
      primary = Prisma.sql`(${DISTRO_RANK} IS NULL), ${DISTRO_NAME} ${dir}, ${DISTRO_RANK} ${dir}`
      break
    case "fixStatus":
      primary = nullsLast(FIX_RANK)
      break
    case "isKev":
      primary = Prisma.sql`r."isKev" ${dir}`
      break
    default:
      primary = nullsLast(Prisma.raw(`r."${column}"`))
  }
  // Ties as the list was loaded before: highest CVSS, newest; then a fixed order.
  return Prisma.sql`${primary}, r."cvssScore" DESC NULLS LAST, r."detectedAt" DESC, r."id"`
}

export type AlertPage = { rows: Alert[]; total: number; page: number; pageSize: number }

type RowRef = { id: string; rowKey: string }

/**
 * The list's rows for `q` as SQL: `rows` holds one representative alert per
 * row (its id, its row key and what it sorts by).
 */
function groupedRows(q: AlertQuery, conditions: Prisma.Sql[]): Prisma.Sql {
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty
  const rowConditions: Prisma.Sql[] = []
  if (q.q) rowConditions.push(Prisma.sql`g."packageHit"`)
  if (q.vuln) rowConditions.push(Prisma.sql`r."externalId" ILIKE ${contains(q.vuln)}`)
  const rowWhere = rowConditions.length ? Prisma.sql`WHERE ${Prisma.join(rowConditions, " AND ")}` : Prisma.empty
  const packageHit = q.q ? Prisma.sql`bool_or(f."packageName" ILIKE ${contains(q.q)})` : Prisma.sql`true`

  // f: the matching alerts, with what a row sorts by. g: one per row, hashed
  // rather than sorted (sorting every alert by its key was most of the time);
  // the representative is the smallest (package name, id) pair. r: the
  // representative's own values, from f, so no alert is read twice.
  return Prisma.sql`
    WITH f AS MATERIALIZED (
      SELECT a."id", a."findingKey", a."packageName", a."cvssScore", a."epssScore", a."isKev", a."externalId",
             a."ecosystem", a."distroPriority", a."fixStatus", a."detectedAt", a."dueDate", a."updatedAt"
      FROM "Alert" a ${where}
    ), g AS (
      SELECT f."findingKey", min(ARRAY[f."packageName", f."id"]) AS "rep", ${packageHit} AS "packageHit"
      FROM f GROUP BY f."findingKey"
    ), rows AS (
      SELECT r.*, g."findingKey" AS "rowKey" FROM g JOIN f r ON r."id" = g."rep"[2] ${rowWhere}
    )`
}

// Grouping a few hundred thousand alerts needs more than PostgreSQL's 4MB default to stay off disk.
const GROUPING_WORK_MEM = Prisma.sql`SET LOCAL work_mem = '64MB'`

/** One page of the Alerts list for `q`, and how many rows the whole list has. */
export async function listAlertPage(q: AlertQuery, now: Date = new Date()): Promise<AlertPage> {
  const conditions = alertConditions(q, now)
  const grouped = groupedRows(q, conditions)

  const offset = (q.page - 1) * q.pageSize
  const [, page] = await prisma.$transaction([
    prisma.$executeRaw(GROUPING_WORK_MEM),
    prisma.$queryRaw<(RowRef & { total: bigint })[]>`
      ${grouped}
      SELECT r."id", r."rowKey", count(*) OVER () AS "total" FROM rows r
      ORDER BY ${orderBy(q.sort.column, q.sort.desc)}
      LIMIT ${q.pageSize} OFFSET ${offset}`,
  ])
  // Past the last page no row carries the total.
  let count = page.length ? page[0].total : BigInt(0)
  if (!page.length && q.page > 1) {
    const [, [row]] = await prisma.$transaction([
      prisma.$executeRaw(GROUPING_WORK_MEM),
      prisma.$queryRaw<{ count: bigint }[]>`${grouped} SELECT count(*) AS "count" FROM rows`,
    ])
    count = row.count
  }

  const rows = await loadRows(await memberIds(page, conditions))
  return { rows, total: Number(count), page: q.page, pageSize: q.pageSize }
}

/**
 * Every alert of the list for `q`, every page, in list order (each row's
 * alerts together, the shown one first), `batchRows` rows at a time.
 */
export async function* allListAlerts(q: AlertQuery, now: Date = new Date(), batchRows = 200): AsyncGenerator<Alert[]> {
  const conditions = alertConditions(q, now)
  const [, refs] = await prisma.$transaction([
    prisma.$executeRaw(GROUPING_WORK_MEM),
    prisma.$queryRaw<RowRef[]>`
      ${groupedRows(q, conditions)}
      SELECT r."id", r."rowKey" FROM rows r ORDER BY ${orderBy(q.sort.column, q.sort.desc)}`,
  ])
  for (let i = 0; i < refs.length; i += batchRows) {
    const rows = await loadRows(await memberIds(refs.slice(i, i + batchRows), conditions))
    yield rows.flatMap((row) => row._groupMembers ?? [row])
  }
}

/**
 * Every alert behind the list for `q` (all its rows, each row's matching
 * alerts), and how many rows that is, as the list counts them. What a bulk
 * action on "everything this view shows" acts on.
 */
export async function allListAlertIds(q: AlertQuery, now: Date = new Date()): Promise<{ rowCount: number; alertIds: string[] }> {
  const conditions = alertConditions(q, now)
  const grouped = groupedRows(q, conditions)
  const [, [{ count }], alerts] = await prisma.$transaction([
    prisma.$executeRaw(GROUPING_WORK_MEM),
    prisma.$queryRaw<{ count: bigint }[]>`${grouped} SELECT count(*) AS "count" FROM rows`,
    prisma.$queryRaw<{ id: string }[]>`
      ${grouped}
      SELECT f."id" FROM f WHERE f."findingKey" IN (SELECT r."rowKey" FROM rows r)`,
  ])
  return { rowCount: Number(count), alertIds: alerts.map((a) => a.id) }
}

/** The ids of each row's matching alerts: the representative first, then by package name. */
async function memberIds(refs: RowRef[], conditions: Prisma.Sql[]): Promise<string[][]> {
  if (refs.length === 0) return []
  const members = await prisma.$queryRaw<{ id: string; findingKey: string }[]>`
    SELECT a."id", a."findingKey" FROM "Alert" a
    WHERE a."findingKey" IN (${inList(refs.map((r) => r.rowKey))})
      ${conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
    ORDER BY ARRAY[a."packageName", a."id"]`
  const byKey = new Map<string, string[]>()
  for (const m of members) {
    const ids = byKey.get(m.findingKey) ?? []
    ids.push(m.id)
    byKey.set(m.findingKey, ids)
  }
  return refs.map((r) => [r.id, ...(byKey.get(r.rowKey) ?? []).filter((id) => id !== r.id)])
}

/** The alerts of each row, shaped as the list shows them (lib/alerts/load-all.ts). */
async function loadRows(groups: string[][]): Promise<Alert[]> {
  const ids = groups.flat()
  if (ids.length === 0) return []
  const alerts = await prisma.alert.findMany({
    where: { id: { in: ids } },
    include: {
      asset: {
        select: {
          id: true, name: true, hostname: true,
          assetTags: { include: { tag: { select: { id: true, name: true, color: true, isDefault: true } } } },
        },
      },
    },
  })
  const packageTags = await prisma.packageTag.findMany({
    where: { packageName: { in: [...new Set(alerts.map((a) => a.packageName))] } },
    include: { tag: { select: { id: true, name: true, color: true, isDefault: true } } },
  })
  const packageTagMap = new Map<string, { id: string; name: string; color: string | null; isDefault: boolean }[]>()
  for (const pt of packageTags) {
    if (!packageTagMap.has(pt.packageName)) packageTagMap.set(pt.packageName, [])
    packageTagMap.get(pt.packageName)!.push(pt.tag)
  }
  const packages = await prisma.package.findMany({
    where: {
      assetId: { in: [...new Set(alerts.map((a) => a.assetId))] },
      name: { in: [...new Set(alerts.map((a) => a.packageName))] },
    },
    select: { assetId: true, name: true, version: true, direct: true },
  })
  const directMap = new Map(packages.map((p) => [`${p.assetId}::${p.name}::${p.version}`, p.direct]))

  const byId = new Map<string, Alert>()
  for (const alert of alerts) {
    const seen = new Set<string>()
    const tags = [...alert.asset.assetTags.map((at) => at.tag), ...(packageTagMap.get(alert.packageName) ?? [])].filter((t) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    const { assetTags: _, ...asset } = alert.asset
    const pkgKey = `${alert.assetId}::${alert.packageName}::${alert.packageVersion}`
    byId.set(alert.id, { ...alert, asset, tags, packageDirect: directMap.get(pkgKey) ?? null, packageExists: directMap.has(pkgKey) })
  }

  return groups.map((ids) => {
    const members = ids.map((id) => byId.get(id)).filter((a): a is Alert => a !== undefined)
    return members.length > 1 ? { ...members[0], _groupMembers: members } : members[0]
  }).filter((row): row is Alert => row !== undefined)
}

export type AlertListFacets = {
  assets: { id: string; name: string; hostname: string }[]
  ecosystems: string[]
  sources: string[]
  distroLabels: string[]
  fixStatuses: string[]
  tags: { id: string; name: string }[]
}

/** The values the list's filters offer: every value some alert has. */
export async function alertListFacets(): Promise<AlertListFacets> {
  const [assets, ecosystems, sources, distroLabels, fixStatuses, tags] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; hostname: string }[]>`
      SELECT s."id", s."name", s."hostname" FROM "Asset" s
      WHERE EXISTS (SELECT 1 FROM "Alert" a WHERE a."assetId" = s."id")`,
    prisma.$queryRaw<{ v: string }[]>`SELECT DISTINCT "ecosystem" AS v FROM "Alert" WHERE "ecosystem" <> ''`,
    prisma.$queryRaw<{ v: string }[]>`SELECT DISTINCT unnest("sources") AS v FROM "Alert"`,
    prisma.$queryRaw<{ v: string }[]>`SELECT DISTINCT "distroLabel" AS v FROM "Alert" WHERE "distroLabel" IS NOT NULL`,
    prisma.$queryRaw<{ v: string }[]>`SELECT DISTINCT "fixStatus" AS v FROM "Alert" WHERE "fixStatus" IS NOT NULL AND "fixStatus" <> ''`,
    prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT t."id", t."name" FROM "Tag" t
      WHERE EXISTS (SELECT 1 FROM "AssetTag" at JOIN "Alert" a ON a."assetId" = at."assetId" WHERE at."tagId" = t."id")
         OR EXISTS (SELECT 1 FROM "PackageTag" pt JOIN "Alert" a ON a."packageName" = pt."packageName" WHERE pt."tagId" = t."id")`,
  ])
  const values = (rows: { v: string }[]) => rows.map((r) => r.v).sort()
  return {
    assets: assets.sort((x, y) => (x.name || x.hostname).localeCompare(y.name || y.hostname)),
    ecosystems: values(ecosystems),
    sources: values(sources),
    distroLabels: values(distroLabels),
    fixStatuses: values(fixStatuses),
    tags: tags.sort((x, y) => x.name.localeCompare(y.name)),
  }
}
