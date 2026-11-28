/**
 * The Audit Log page's state as URL search parameters, so a view can be linked to and
 * the back button works. Client-safe.
 *
 * `action` is comma-separated; `user` matches the email, `q` the target or the detail
 * (both case-insensitive substrings). `from` and `to` bound the time (lib/date-range.ts).
 */
import { parseDateBound } from "@/lib/date-range"

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
    from: parseDateBound(get(params, "from")),
    to: parseDateBound(get(params, "to")),
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
