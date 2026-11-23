import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { isDayBound, type AuditQuery } from "@/lib/audit-query"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Prisma's `contains` passes the text on as a LIKE pattern, so a % or _ typed in a search
 * would match any characters. Escaped, they are looked for as they are.
 */
const literal = (text: string) => text.replace(/[\\%_]/g, "\\$&")

export type AuditListRow = {
  id: string
  userEmail: string | null
  action: string
  target: string | null
  detail: string | null
  createdAt: Date
}

/** The rows a query selects. A `from` or `to` that is a UTC day takes the whole day; an instant takes just that moment. Both ends are included. */
export function auditWhere(query: AuditQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = []
  if (query.actions.length) and.push({ action: { in: query.actions } })
  if (query.user) and.push({ userEmail: { contains: literal(query.user), mode: "insensitive" } })
  if (query.q) {
    and.push({ OR: [
      { target: { contains: literal(query.q), mode: "insensitive" } },
      { detail: { contains: literal(query.q), mode: "insensitive" } },
    ] })
  }
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(isDayBound(query.from) ? `${query.from}T00:00:00Z` : query.from) } : {}),
        ...(query.to
          ? isDayBound(query.to)
            ? { lt: new Date(new Date(`${query.to}T00:00:00Z`).getTime() + DAY_MS) }
            : { lte: new Date(query.to) }
          : {}),
      },
    })
  }
  return and.length ? { AND: and } : {}
}

/**
 * One page of the audit log, newest first. A page past the end is the last page, and `page`
 * says which page it is: the log shrinks (a retention purge, a narrower filter) while a
 * link to a later page is still around.
 */
export async function listAuditPage(query: AuditQuery): Promise<{ rows: AuditListRow[]; total: number; page: number }> {
  const where = auditWhere(query)
  const total = await prisma.auditLog.count({ where })
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
    select: { id: true, userEmail: true, action: true, target: true, detail: true, createdAt: true },
  })
  return { rows, total, page }
}

/** Every action the log holds, for the Action filter. */
export async function auditActionNames(): Promise<string[]> {
  const groups = await prisma.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } })
  return groups.map((g) => g.action)
}
