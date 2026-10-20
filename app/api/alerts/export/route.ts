import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { logger } from "@/lib/logger"
import { parseAlertQuery } from "@/lib/alerts/query-params"
import { allListAlerts } from "@/lib/alerts/query"
import { alertCsvHeaderLine, alertCsvLine, alertJsonElement, exportFilename } from "@/lib/alerts/export-format"

/**
 * Every alert of an Alerts list view as CSV (`format=csv`) or JSON
 * (`format=json`). The view is the list's own URL parameters
 * (lib/alerts/query-params.ts), so the file holds exactly what the list
 * shows across all its pages, each grouped row's alerts together.
 * Written as it is read, so a large list never sits in memory whole.
 */
export const GET = withApiErrorHandling("alerts.export", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = new URL(req.url).searchParams
  const format = params.get("format") === "json" ? "json" : "csv"
  const query = parseAlertQuery(params)
  const now = new Date()
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // The same text the list's own export wrote: CSV lines joined by CRLF,
        // JSON as JSON.stringify(records, null, 2).
        let wroteAlert = false
        controller.enqueue(encoder.encode(format === "csv" ? alertCsvHeaderLine() : "["))
        for await (const alerts of allListAlerts(query, now)) {
          const parts: string[] = []
          for (const a of alerts) {
            if (format === "csv") parts.push("\r\n" + alertCsvLine(a))
            else parts.push((wroteAlert ? ",\n" : "\n") + alertJsonElement(a))
            wroteAlert = true
          }
          controller.enqueue(encoder.encode(parts.join("")))
        }
        if (format === "json") controller.enqueue(encoder.encode(wroteAlert ? "\n]" : "]"))
        controller.close()
      } catch (err) {
        // Headers are gone by now: end the download broken rather than pretend it is whole.
        logger.warn("alerts.export failed", { error: err instanceof Error ? err.message : String(err) })
        controller.error(err)
      }
    },
  })

  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(format, now)}"`,
      "Cache-Control": "no-store",
    },
  })
})
