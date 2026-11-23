/**
 * The Audit Log page's state as URL search parameters, so a view can be linked to and
 * the back button works. Client-safe.
 *
 * `action` is comma-separated; `user` matches the email, `q` the target or the detail
 * (both case-insensitive substrings). `from` and `to` bound the time: each is a UTC day
 * (YYYY-MM-DD, the whole day, both ends included) or an instant (ISO 8601, `Z`). The page
 * sends instants, the start and the end of the days the user picked in their own time zone,
 * since the log shows local times. Anything malformed is ignored rather than refused.
 */
export const AUDIT_PAGE_SIZES = [10, 15, 25, 50] as const
export const AUDIT_DEFAULT_PAGE_SIZE = 25

const MAX_TEXT_LENGTH = 200
const MAX_ACTIONS = 30
const ACTION_NAME = /^[a-z0-9_]{1,64}$/

export type AuditQuery = {
  page: number
  pageSize: number
  actions: string[]
  user: string | null
  q: string | null
  from: string | null
  to: string | null
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v.join(",") : v
}

function text(params: Params, key: string): string | null {
  const v = get(params, key)?.trim().slice(0, MAX_TEXT_LENGTH)
  return v ? v : null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

/** A real calendar day (YYYY-MM-DD) or an instant (ISO 8601, in UTC), as the ISO form of either; or null. */
function bound(params: Params, key: string): string | null {
  const v = get(params, key)?.trim()
  if (!v) return null
  if (DAY.test(v)) {
    const d = new Date(`${v}T00:00:00Z`)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
  }
  if (INSTANT.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.slice(0, 10) ? null : d.toISOString()
  }
  return null
}

/** Whether a `from` or `to` is a day (the whole UTC day) and not an instant. */
export const isDayBound = (value: string) => DAY.test(value)

// The days the page's calendar picks are the user's own, the ones the log's times are shown in.
/** The first instant of a local day. */
export const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
/** The last instant of a local day. */
export const endOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
/** The local day a `from` or `to` falls on, for the calendar. A UTC day shows as the day of that name. */
export function boundToLocalDay(value: string): Date {
  if (DAY.test(value)) {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export function parseAuditQuery(params: Params): AuditQuery {
  const page = Math.max(1, Math.floor(Number(get(params, "page")) || 1))
  const size = Number(get(params, "size"))
  const actions = [...new Set((get(params, "action") ?? "").split(",").map((s) => s.trim()).filter((s) => ACTION_NAME.test(s)))].slice(0, MAX_ACTIONS)
  return {
    page,
    pageSize: (AUDIT_PAGE_SIZES as readonly number[]).includes(size) ? size : AUDIT_DEFAULT_PAGE_SIZE,
    actions,
    user: text(params, "user"),
    q: text(params, "q"),
    from: bound(params, "from"),
    to: bound(params, "to"),
  }
}

/** The URL parameters of a query, leaving out what is the default. */
export function auditQueryToSearchParams(query: AuditQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (query.page > 1) p.set("page", String(query.page))
  if (query.pageSize !== AUDIT_DEFAULT_PAGE_SIZE) p.set("size", String(query.pageSize))
  if (query.actions.length) p.set("action", query.actions.join(","))
  if (query.user) p.set("user", query.user)
  if (query.q) p.set("q", query.q)
  if (query.from) p.set("from", query.from)
  if (query.to) p.set("to", query.to)
  return p
}

/** Whether the query narrows the log at all (the page and its size do not). */
export function auditQueryIsFiltered(query: AuditQuery): boolean {
  return query.actions.length > 0 || !!query.user || !!query.q || !!query.from || !!query.to
}
