import { NextRequest, NextResponse } from "next/server"
import { PassThrough, Readable } from "node:stream"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { withApiErrorHandling } from "@/lib/api-handler"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { alertQueryToSearchParams, parseAlertQuery } from "@/lib/alerts/query-params"
import { allListAlerts } from "@/lib/alerts/query"
import { alertJsonElement, exportFilename } from "@/lib/alerts/export-format"
import { writeAlertsXlsx } from "@/lib/alerts/export-xlsx"
import { timelineText } from "@/lib/alerts/event-text"
import type { Alert } from "@/lib/alerts/list-filters"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** The timelines of a batch of alerts, as text, by alert ID: one query per batch. */
async function loadTimelines(alertIds: string[]): Promise<Map<string, string>> {
  const events = await prisma.alertEvent.findMany({
    where: { alertId: { in: alertIds } },
    select: { alertId: true, type: true, data: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  const byAlert = new Map<string, typeof events>()
  for (const e of events) {
    if (!byAlert.has(e.alertId)) byAlert.set(e.alertId, [])
    byAlert.get(e.alertId)!.push(e)
  }
  return new Map([...byAlert].map(([id, list]) => [id, timelineText(list)]))
}

/** The alerts as they are read, counted. */
async function* counted(batches: AsyncIterable<Alert[]>, counter: { n: number }): AsyncGenerator<Alert[]> {
  for await (const alerts of batches) {
    counter.n += alerts.length
    yield alerts
  }
}

/**
 * Every alert of an Alerts list view as an Excel workbook (`format=xlsx`) or
 * JSON (`format=json`); any other format is 400 (CSV is no longer offered).
 * The view is the list's own URL parameters (lib/alerts/query-params.ts), so
 * the file holds exactly what the list shows across all its pages, each
 * grouped row's alerts one by one. Written as it is read, so a large list never
 * sits in memory whole. Every export is recorded in the audit log, with who,
 * the format, the filters and how many alerts it held.
 */
export const GET = withApiErrorHandling("alerts.export", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = new URL(req.url).searchParams
  const format = params.get("format")
  if (format !== "xlsx" && format !== "json") {
    return NextResponse.json({ error: 'format must be "xlsx" or "json"' }, { status: 400 })
  }
  const query = parseAlertQuery(params)
  const filters = alertQueryToSearchParams({ ...query, page: 1 }).toString()
  const now = new Date()
  const counter = { n: 0 }
  const batches = counted(allListAlerts(query, now), counter)

  const audit = (error?: unknown) => createAuditLog({
    userId: session.user.id,
    userEmail: session.user.email,
    action: "alerts_exported",
    detail: `${format}: ${counter.n} alerts${error ? " (failed)" : ""}; filters: ${filters || "(none)"}`,
  })
  const failed = (err: unknown) => {
    logger.warn("alerts.export failed", { format, alerts: counter.n, error: err instanceof Error ? err.message : String(err) })
    void audit(err)
  }

  if (format === "xlsx") {
    const out = new PassThrough()
    writeAlertsXlsx(out, batches, loadTimelines, { generatedAt: now, filters })
      .then(() => audit())
      // Headers are gone by now: end the download broken rather than pretend it is whole.
      .catch((err) => { failed(err); out.destroy(err instanceof Error ? err : new Error(String(err))) })
    return new NextResponse(Readable.toWeb(out) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${exportFilename("xlsx", now)}"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // As JSON.stringify(records, null, 2) would write it.
        let wroteAlert = false
        controller.enqueue(encoder.encode("["))
        for await (const alerts of batches) {
          const parts: string[] = []
          for (const a of alerts) {
            parts.push((wroteAlert ? ",\n" : "\n") + alertJsonElement(a))
            wroteAlert = true
          }
          controller.enqueue(encoder.encode(parts.join("")))
        }
        controller.enqueue(encoder.encode(wroteAlert ? "\n]" : "]"))
        controller.close()
        await audit()
      } catch (err) {
        failed(err)
        controller.error(err)
      }
    },
  })

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("json", now)}"`,
      "Cache-Control": "no-store",
    },
  })
})
