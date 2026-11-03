import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { buildExecutiveReport } from "@/lib/reports/executive"
import { executiveCsv, executiveCsvFilename } from "@/lib/reports/executive-csv"
import { parseReportRequest } from "@/lib/reports/request"

/**
 * The executive report for the conditions in the URL (lib/reports/request.ts), the same ones
 * the Reports page takes: its per-tag table as CSV (`format=csv`, the default) or the whole
 * report as JSON (`format=json`).
 */
export const GET = withApiErrorHandling("reports.executive", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = new URL(req.url).searchParams
  const request = parseReportRequest(params)
  if ("error" in request) return NextResponse.json({ error: request.error }, { status: 400 })

  const report = await buildExecutiveReport({ period: request.period, tagIds: request.tagIds })
  if (params.get("format") === "json") {
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  }
  // A byte order mark, so Excel reads tag names as UTF-8.
  return new NextResponse("﻿" + executiveCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${executiveCsvFilename(report)}"`,
      "Cache-Control": "no-store",
    },
  })
})
