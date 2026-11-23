import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { AuditTable } from "./audit-table"
import { parseAuditQuery } from "@/lib/audit-query"
import { auditActionNames, listAuditPage } from "@/lib/audit-list"

type SearchParams = Record<string, string | string[] | undefined>

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (!session) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })
  if (dbUser?.role !== "admin") redirect("/")

  const query = parseAuditQuery(await searchParams)
  const [list, actions] = await Promise.all([listAuditPage(query), auditActionNames()])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <p className="text-sm text-muted-foreground">
        Newest first. Records login, user management, settings, and asset operations.
      </p>
      <AuditTable rows={list.rows} total={list.total} page={list.page} query={query} actions={actions} />
    </div>
  )
}
