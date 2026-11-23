import { NextRequest, NextResponse } from "next/server"
import { PassThrough, Readable } from "node:stream"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { AUDIT_DEFAULT_PAGE_SIZE, auditQueryToSearchParams, parseAuditQuery } from "@/lib/audit-query"
import { allAuditRows, type AuditListRow } from "@/lib/audit-list"
import { auditExportFilename, auditJsonElement, writeAuditXlsx } from "@/lib/audit-export"

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** The events as they are read, counted. */
async function* counted(batches: AsyncIterable<AuditListRow[]>, counter: { n: number }): AsyncGenerator<AuditListRow[]> {
  for await (const rows of batches) {
    counter.n += rows.length
    yield rows
  }
}

/**
 * Every event of an Audit Log view as an Excel workbook (`format=xlsx`) or JSON (`format=json`);
 * any other format is 400. The view is the page's own URL parameters (lib/audit-query.ts), so the
 * file holds exactly what the page shows across all its pages. Written as it is read, so a large
 * log never sits in memory whole. Admins only, like the page. Every export is recorded in the
 * audit log, with who, the format, the filters and how many events it held.
 */
export const GET = withApiErrorHandling("audit.export", async (req: NextRequest) => {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const format = params.get("format")
  if (format !== "xlsx" && format !== "json") {
    return NextResponse.json({ error: 'format must be "xlsx" or "json"' }, { status: 400 })
  }
  const query = parseAuditQuery(params)
  const filters = auditQueryToSearchParams({ ...query, page: 1, pageSize: AUDIT_DEFAULT_PAGE_SIZE }).toString()
  const now = new Date()
  const counter = { n: 0 }
  const batches = counted(allAuditRows(query), counter)

  // The export is an event of its own, written once the file is: it is not in the file.
  const record = (error?: unknown) => createAuditLog({
    userId: session.user.id,
    userEmail: session.user.email,
    action: "audit_exported",
    detail: `${format}: ${counter.n} events${error ? " (failed)" : ""}; filters: ${filters || "(none)"}`,
  })
  const failed = (err: unknown) => {
    logger.warn("audit.export failed", { format, events: counter.n, error: err instanceof Error ? err.message : String(err) })
    void record(err)
  }

  if (format === "xlsx") {
    const out = new PassThrough()
    writeAuditXlsx(out, batches, { generatedAt: now, filters })
      .then(() => record())
      // Headers are gone by now: end the download broken rather than pretend it is whole.
      .catch((err) => { failed(err); out.destroy(err instanceof Error ? err : new Error(String(err))) })
    return new NextResponse(Readable.toWeb(out) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${auditExportFilename("xlsx", now)}"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // As JSON.stringify(records, null, 2) would write it.
        let wrote = false
        controller.enqueue(encoder.encode("["))
        for await (const rows of batches) {
          const parts: string[] = []
          for (const r of rows) {
            parts.push((wrote ? ",\n" : "\n") + auditJsonElement(r))
            wrote = true
          }
          controller.enqueue(encoder.encode(parts.join("")))
        }
        controller.enqueue(encoder.encode(wrote ? "\n]" : "]"))
        controller.close()
        await record()
      } catch (err) {
        failed(err)
        controller.error(err)
      }
    },
  })

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${auditExportFilename("json", now)}"`,
      "Cache-Control": "no-store",
    },
  })
})
