import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { prisma } from "@/lib/db"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ReportControls } from "@/components/reports/report-controls"
import { ExecutiveReportView } from "@/components/reports/executive-report"
import { ReportActions } from "@/components/reports/report-client"
import { buildExecutiveReport } from "@/lib/reports/executive"
import { formatDay, presetPeriod } from "@/lib/reports/period"
import { parseReportRequest, reportSearchParams, type ReportRequest } from "@/lib/reports/request"

type SearchParams = Record<string, string | string[] | undefined>

/**
 * The executive summary's conditions, and the report once they are chosen. Opening the page
 * only shows the conditions, since a report on a large fleet takes a while; Generate puts them
 * in the URL, so a report's URL opens the same report again, up to the moment it is opened.
 */
export default async function ExecutiveReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const get = (name: string) => typeof params[name] === "string" ? params[name] : null
  const tags = await prisma.tag.findMany({ where: { type: "asset" }, select: { id: true, name: true }, orderBy: { name: "asc" } })

  const generated = get("period") != null
  const request = generated ? parseReportRequest({ get }) : null
  const valid = request && !("error" in request) ? request : null

  const shown = valid?.period ?? presetPeriod("last_30_days")
  const initial = {
    choice: valid?.choice ?? "last_30_days" as const,
    since: formatDay(shown.from),
    tagIds: valid?.tagIds ?? [],
  }
  const query = valid ? reportSearchParams(valid).toString() : ""

  return (
    <div className="space-y-4">
      <div className="space-y-4 print:hidden">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Executive summary</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {/* Keyed on the report's URL, so the form follows the browser's back and forward. */}
        <ReportControls key={query} tags={tags} initial={initial} />
        {request && "error" in request && <p className="text-sm text-destructive">{request.error}</p>}
        {valid && <ReportActions csvHref={`/api/reports/executive?${query}`} />}
      </div>
      {valid && (
        <Suspense key={query} fallback={<Generating />}>
          <Report request={valid} />
        </Suspense>
      )}
    </div>
  )
}

async function Report({ request }: { request: ReportRequest }) {
  const report = await buildExecutiveReport({ period: request.period, tagIds: request.tagIds })
  return <ExecutiveReportView report={report} />
}

function Generating() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Generating the report…
    </div>
  )
}
