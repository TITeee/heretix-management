import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { AuditQuery } from "@/lib/audit-query"
import { dateRangeInstants } from "@/lib/date-range"
import { escapeLike } from "@/lib/like"


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
  if (query.user) and.push({ userEmail: { contains: escapeLike(query.user), mode: "insensitive" } })
  if (query.q) {
    and.push({ OR: [
      { target: { contains: escapeLike(query.q), mode: "insensitive" } },
      { detail: { contains: escapeLike(query.q), mode: "insensitive" } },
    ] })
  }
  if (query.from || query.to) {
    const { from, toExclusive } = dateRangeInstants(query.from, query.to)
    and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } })
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

/**
 * Every row a query selects, newest first, in batches: what an export writes as it reads. The
 * query's page and page size are not used. Each batch starts after the last row of the one before
 * it, so events recorded while it runs do not shift the rows it has still to read.
 */
export async function* allAuditRows(query: AuditQuery, batchSize = 2000): AsyncGenerator<AuditListRow[]> {
  const where = auditWhere(query)
  let after: string | undefined
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: batchSize,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: { id: true, userEmail: true, action: true, target: true, detail: true, createdAt: true },
    })
    if (rows.length === 0) return
    yield rows
    if (rows.length < batchSize) return
    after = rows[rows.length - 1].id
  }
}

