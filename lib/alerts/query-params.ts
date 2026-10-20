/**
 * The Alerts list's state as URL search parameters: what the list, the export
 * and bulk actions all read, so they agree on which alerts a view holds.
 * Client-safe.
 *
 * The parameters other screens link with keep their meaning: assetId,
 * packageName and packageVersion are exact matches, severity is a tier key
 * (CRITICAL..LOW, UNKNOWN; lib/severity.ts severityTierFromKey), kev=1 means
 * the KEV risk filter, and status narrows by status. A multi-valued filter is
 * comma-separated (`status=open,in_progress`).
 */
import { severityTierFromKey, type SeverityTier } from "@/lib/severity"
import type { SlaStatus } from "@/lib/sla"

export const PAGE_SIZES = [10, 15, 25, 50] as const
export const DEFAULT_PAGE_SIZE = 10

/** Columns the list sorts by. */
export const SORT_COLUMNS = [
  "cvssScore", "distroPriority", "fixStatus", "isKev", "epssScore", "externalId", "detectedAt", "dueDate", "updatedAt",
] as const
export type SortColumn = (typeof SORT_COLUMNS)[number]

export const DEFAULT_SORT: { column: SortColumn; desc: boolean } = { column: "detectedAt", desc: true }

/** Statuses shown when the URL names none. `status=` (empty) shows every status. */
export const DEFAULT_STATUSES = ["open", "in_progress"]

/** The distro-rating / fix-status filter value for alerts that have none. */
export const NONE = "none"

const SEVERITY_TIERS: SeverityTier[] = ["critical", "high", "medium", "low", "na"]
const RISKS = ["kev", "malware"] as const
const DEPENDENCIES = ["direct", "indirect"] as const
const INVENTORIES = ["present", "missing"] as const
const DUE_STATUSES: SlaStatus[] = ["overdue", "urgent", "warning", "ok", "unscored"]

export type AlertQuery = {
  page: number
  pageSize: number
  sort: { column: SortColumn; desc: boolean }
  /** Exact matches, as other screens link with them. */
  packageName: string | null
  packageVersion: string | null
  /** Substring searches, case-insensitive: any package of a row, its vulnerability id. */
  q: string | null
  vuln: string | null
  assetIds: string[]
  statuses: string[]
  severityTiers: SeverityTier[]
  risks: (typeof RISKS)[number][]
  ecosystems: string[]
  sources: string[]
  tagIds: string[]
  dependencies: (typeof DEPENDENCIES)[number][]
  inventories: (typeof INVENTORIES)[number][]
  dues: SlaStatus[]
  /** distroPriorityLabel values ("Red Hat: low"), or NONE. */
  distroLabels: string[]
  /** fixStatus values, or NONE. */
  fixStatuses: string[]
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v.join(",") : v
}

function list(params: Params, key: string): string[] {
  const v = get(params, key)
  if (!v) return []
  return [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))]
}

function oneOf<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v))
}

function text(params: Params, key: string): string | null {
  const v = get(params, key)?.trim()
  return v ? v : null
}

export function parseAlertQuery(params: Params): AlertQuery {
  const page = Math.max(1, Math.floor(Number(get(params, "page")) || 1))
  const sizeParam = Number(get(params, "size"))
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE

  const sortParam = get(params, "sort")
  const sortColumn = (SORT_COLUMNS as readonly string[]).includes(sortParam ?? "") ? (sortParam as SortColumn) : DEFAULT_SORT.column
  const dir = get(params, "dir")
  const desc = sortParam && (SORT_COLUMNS as readonly string[]).includes(sortParam) ? dir !== "asc" : DEFAULT_SORT.desc

  const statusParam = get(params, "status")
  const statuses = statusParam === undefined ? DEFAULT_STATUSES : list(params, "status")

  // severity: tier keys from links (CRITICAL..UNKNOWN) or tier names (critical..na).
  const toTier = (s: string): SeverityTier | null =>
    severityTierFromKey(s) ?? ((SEVERITY_TIERS as string[]).includes(s) ? (s as SeverityTier) : null)
  const severityTiers = [...new Set(list(params, "severity").map(toTier).filter((t): t is SeverityTier => t !== null))]

  const risks = oneOf(list(params, "risk"), RISKS)
  if (get(params, "kev") && !risks.includes("kev")) risks.push("kev")

  return {
    page,
    pageSize,
    sort: { column: sortColumn, desc },
    packageName: text(params, "packageName"),
    packageVersion: text(params, "packageVersion"),
    q: text(params, "q"),
    vuln: text(params, "vuln"),
    assetIds: list(params, "assetId"),
    statuses,
    severityTiers,
    risks,
    ecosystems: list(params, "ecosystem"),
    sources: list(params, "source"),
    tagIds: list(params, "tag"),
    dependencies: oneOf(list(params, "dependency"), DEPENDENCIES),
    inventories: oneOf(list(params, "inventory"), INVENTORIES),
    dues: oneOf(list(params, "due"), DUE_STATUSES),
    distroLabels: list(params, "distro"),
    fixStatuses: list(params, "fixStatus"),
  }
}

/**
 * The URL search parameters for a query, leaving out what is the default, so
 * a link stays short and parseAlertQuery reads it back to the same query.
 */
export function alertQueryToSearchParams(q: AlertQuery): URLSearchParams {
  const p = new URLSearchParams()
  const set = (key: string, values: string[]) => { if (values.length > 0) p.set(key, values.join(",")) }
  set("assetId", q.assetIds)
  const isDefaultStatus = q.statuses.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((s) => q.statuses.includes(s))
  if (!isDefaultStatus) p.set("status", q.statuses.join(","))
  set("severity", q.severityTiers)
  set("risk", q.risks)
  set("ecosystem", q.ecosystems)
  set("source", q.sources)
  set("tag", q.tagIds)
  set("dependency", q.dependencies)
  set("inventory", q.inventories)
  set("due", q.dues)
  set("distro", q.distroLabels)
  set("fixStatus", q.fixStatuses)
  if (q.packageName) p.set("packageName", q.packageName)
  if (q.packageVersion) p.set("packageVersion", q.packageVersion)
  if (q.q) p.set("q", q.q)
  if (q.vuln) p.set("vuln", q.vuln)
  if (q.sort.column !== DEFAULT_SORT.column || q.sort.desc !== DEFAULT_SORT.desc) {
    p.set("sort", q.sort.column)
    p.set("dir", q.sort.desc ? "desc" : "asc")
  }
  if (q.pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(q.pageSize))
  if (q.page > 1) p.set("page", String(q.page))
  return p
}
