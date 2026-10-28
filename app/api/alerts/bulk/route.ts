import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { createAuditLog } from "@/lib/audit"
import { parseAlertQuery } from "@/lib/alerts/query-params"
import { allListAlertIds } from "@/lib/alerts/query"
import { readJsonBody } from "@/lib/request-body"

// Ignoring needs a reason per alert (see PATCH /api/alerts/[id]), which a bulk
// change does not carry.
const BULK_STATUSES = ["open", "in_progress", "resolved"]
const MAX_IDS = 50_000
// MAX_IDS alert ids come to about 1.4 MB, over the usual 1 MB body limit.
const BULK_BODY_MAX_BYTES = 4 * 1024 * 1024
// Rows per statement: well inside PostgreSQL's limit on bind parameters.
const CHUNK = 5_000

/**
 * Change the status of many alerts at once, as PATCH /api/alerts/[id] would
 * one by one: status, resolvedAt, the ignore decision cleared, a
 * status_changed event per alert that changes, and one audit log entry.
 *
 * Body: `{ status, ids }` for the alerts selected on screen, or
 * `{ status, query, expectedRows }` for everything an Alerts list view shows
 * (`query` being its URL parameters). The view is counted again here and the
 * change refused (409) if its rows no longer number what the user confirmed,
 * as a scan or another user may have changed it since.
 */
export const POST = withApiErrorHandling("alerts.bulk", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await readJsonBody(req, BULK_BODY_MAX_BYTES)
  const { status } = body
  if (!BULK_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${BULK_STATUSES.join(", ")}` }, { status: 400 })
  }

  let ids: string[]
  let scope: string
  if (Array.isArray(body.ids)) {
    if (!body.ids.every((id: unknown) => typeof id === "string") || body.ids.length > MAX_IDS) {
      return NextResponse.json({ error: `ids must be at most ${MAX_IDS} alert ids` }, { status: 400 })
    }
    ids = [...new Set<string>(body.ids)]
    scope = "selected"
  } else if (typeof body.query === "string" && Number.isInteger(body.expectedRows)) {
    const { rowCount, alertIds } = await allListAlertIds(parseAlertQuery(new URLSearchParams(body.query)))
    if (rowCount !== body.expectedRows) {
      return NextResponse.json(
        { error: `The list now has ${rowCount} rows, not ${body.expectedRows}. Nothing was changed.`, rows: rowCount },
        { status: 409 }
      )
    }
    ids = alertIds
    scope = `all ${rowCount} rows of a filtered view`
  } else {
    return NextResponse.json({ error: "Send ids, or query with expectedRows" }, { status: 400 })
  }

  // Only alerts whose status changes: re-saving the same status is not an event.
  const changing: { id: string; status: string }[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    changing.push(...await prisma.alert.findMany({
      where: { id: { in: ids.slice(i, i + CHUNK) }, status: { not: status } },
      select: { id: true, status: true },
    }))
  }

  const userName = session.user?.name ?? session.user?.email ?? "Unknown"
  const resolvedAt = status === "resolved" ? new Date() : null
  for (let i = 0; i < changing.length; i += CHUNK) {
    const chunk = changing.slice(i, i + CHUNK)
    await prisma.$transaction([
      prisma.alert.updateMany({
        where: { id: { in: chunk.map((a) => a.id) } },
        // As leaving "ignored" does one by one: the ignore decision and what it set go.
        data: { status, resolvedAt, ignoreReason: null, vexJustification: null, reopenOnFix: false, notApplicableByScan: false },
      }),
      prisma.alertEvent.createMany({
        data: chunk.map((a) => ({ alertId: a.id, type: "status_changed", data: { from: a.status, to: status, userName } })),
      }),
    ])
  }

  if (changing.length > 0) {
    await createAuditLog({
      userId: session.user?.id ?? null,
      userEmail: session.user?.email ?? null,
      action: "alerts_status_changed",
      target: `${changing.length} alerts`,
      detail: `Status set to ${status} (${scope})`,
    })
  }

  return NextResponse.json({ updated: changing.length, unchanged: ids.length - changing.length })
})
