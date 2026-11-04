import Link from "next/link"
import type { ReactNode } from "react"
import { FaTriangleExclamation } from "react-icons/fa6"
import { fixStatusLabel } from "@/lib/fix-status"
import {
  AGED_DAYS, INTERNET_FACING_TAG, MISSION_CRITICAL_TAG, OVERDUE_LONG_DAYS, SCAN_STALE_DAYS,
  type ChangeToMake, type ExecutiveReport, type PeriodNumbers, type TaggedAssets,
} from "@/lib/reports/executive"
import { TagKindIcon } from "@/components/tags/tag-badge"
import { formatDay, periodDays, type ReportPeriod } from "@/lib/reports/period"
import { summaryLines } from "@/lib/reports/summary"
import { CommentBox, OpenTrendChart } from "./report-client"

/**
 * The executive summary as a page that prints on A4: the first page says where things stand
 * and what needs a decision; the per-tag table, the trend and the lists follow on the next.
 * Plain words stand in for the jargon: "known exploited" for KEV, "changes to make" for the
 * Remediation tab's groups.
 *
 * What needs attention is colored, and only when it is not zero: known exploited findings and
 * malicious packages red (with a warning sign, so they stand out on black-and-white paper too),
 * Critical in the Critical severity's rose, overdue and stale scans amber. Colors are on text
 * and borders only, which print without the browser's background graphics.
 */

const n = (value: number) => value.toLocaleString("en-US")
const pct = (rate: number | null) => rate == null ? "–" : `${Math.round(rate * 100)}%`
const days = (value: number | null) => value == null ? "–" : `${value.toFixed(1)} days`
const day = (date: Date | null) => date ? formatDay(date) : "–"
const moment = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
const span = (p: ReportPeriod) => `${formatDay(p.from)} to ${formatDay(p.to)}`

type Tone = "exploited" | "critical" | "overdue"

const TONE_TEXT: Record<Tone, string> = {
  exploited: "font-semibold text-red-600 dark:text-red-500",
  critical: "font-semibold text-rose-800 dark:text-rose-400",
  overdue: "font-semibold text-amber-700 dark:text-amber-500",
}

const TONE_BORDER: Record<Tone, string> = {
  exploited: "border-red-300 dark:border-red-900",
  critical: "border-rose-300 dark:border-rose-900",
  overdue: "border-amber-300 dark:border-amber-900",
}

/** A count, colored by its tone when it is not zero. */
function Num({ value, tone }: { value: number; tone: Tone }) {
  return value > 0 ? <span className={TONE_TEXT[tone]}>{n(value)}</span> : <>{n(value)}</>
}

const BETTER = "text-green-700 dark:text-green-500"
const WORSE = "text-red-600 dark:text-red-500"

/** The change from the previous period, green when better and red when worse. */
function Change({ now, before, format = n, higherIsBetter }: {
  now: number | null; before: number | null; format?: (v: number) => string; higherIsBetter: boolean | null
}) {
  if (now == null || before == null) return <>–</>
  const d = now - before
  if (Math.abs(d) < 1e-9) return <>±0</>
  const text = `${d > 0 ? "+" : "−"}${format(Math.abs(d))}`
  if (higherIsBetter == null) return <>{text}</>
  return <span className={(d > 0) === higherIsBetter ? BETTER : WORSE}>{text}</span>
}

function changeTitle(c: ChangeToMake): string {
  const to = c.version ? ` to ${c.version}` : ""
  switch (c.kind) {
    case "os_update": return `Update ${c.target}${to}`
    case "direct_upgrade": return `Upgrade ${c.target}${to}`
    case "via_direct": return `Upgrade the dependency that pulls in ${c.target}`
    case "go_rebuild": return "Rebuild Go binaries with a newer Go"
    case "package_update": return `Update ${c.target}${to}`
    case "product_update": return `Update ${c.target}${to}`
  }
}

/** An asset's name, linked, with a crown when it is mission critical and a globe when it is internet facing. */
function AssetLink({ asset }: { asset: { assetId: string; assetName: string; internetFacing: boolean; missionCritical: boolean } }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Link href={`/assets/${asset.assetId}`} className="hover:underline">{asset.assetName}</Link>
      {asset.missionCritical && <span title={MISSION_CRITICAL_TAG} className="text-yellow-600 [&>svg]:size-3.5"><TagKindIcon name={MISSION_CRITICAL_TAG} isDefault /></span>}
      {asset.internetFacing && <span title={INTERNET_FACING_TAG} className="text-red-600 [&>svg]:size-3.5"><TagKindIcon name={INTERNET_FACING_TAG} isDefault /></span>}
    </span>
  )
}

function Section({ title, note, children, className = "" }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-2 break-inside-avoid ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {children}
    </section>
  )
}

/** A plain table: the shadcn one scrolls inside its own box, which cuts it off on paper. */
function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  const align = (i: number) => numeric.includes(i) ? "text-right tabular-nums" : "text-left"
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b">
          {head.map((h, i) => <th key={h} className={`px-2 py-1 font-medium text-muted-foreground ${align(i)}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r} className="border-b last:border-0 break-inside-avoid">
            {cells.map((c, i) => <td key={i} className={`px-2 py-1 align-top ${align(i)}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Shown({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null
  return <p className="text-xs text-muted-foreground">The {n(shown)} most serious of {n(total)} are shown.</p>
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: ReactNode; tone?: Tone }) {
  const lit = tone != null && value > 0
  return (
    <div className={`rounded-lg border p-3 break-inside-avoid ${lit ? TONE_BORDER[tone] : ""}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {lit && tone === "exploited" && <FaTriangleExclamation className="size-3 text-red-600 dark:text-red-500" />}
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${lit ? TONE_TEXT[tone] : ""}`}>{n(value)}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function DecisionHeading({ title, total, tone }: { title: string; total: number; tone: Tone }) {
  return (
    <h3 className="flex items-center gap-1 text-sm font-semibold">
      {total > 0 && tone === "exploited" && <FaTriangleExclamation className="size-3.5 text-red-600 dark:text-red-500" />}
      {title} (<Num value={total} tone={tone} />)
    </h3>
  )
}

function Decisions({ report }: { report: ExecutiveReport }) {
  const d = report.decisions
  const none = <p className="text-sm text-muted-foreground">None.</p>
  return (
    <Section title="Needs a decision">
      <div className="space-y-4">
        <div className="space-y-1">
          <DecisionHeading title="Known exploited or Critical, with no fix yet" total={d.noFix.total} tone="exploited" />
          <p className="text-xs text-muted-foreground">No update can be installed for these; decide whether to isolate, mitigate or accept them.</p>
          {d.noFix.total === 0 ? none : (
            <>
              <Table
                head={["Package", "Vendor status", "Assets", "Findings", "Known exploited", "Critical"]}
                numeric={[3, 4, 5]}
                rows={d.noFix.rows.map((r) => [
                  r.target, fixStatusLabel(r.fixStatus) ?? "–",
                  <span key="a">
                    {n(r.assetCount)}:{" "}
                    {r.assets.map((a, i) => <span key={a.assetId}>{i > 0 && ", "}<AssetLink asset={a} /></span>)}
                    {r.assetCount > r.assets.length && ` +${n(r.assetCount - r.assets.length)} more`}
                  </span>,
                  n(r.alerts),
                  <Num key="k" value={r.kev} tone="exploited" />, <Num key="c" value={r.critical} tone="critical" />,
                ])}
              />
              <Shown total={d.noFix.total} shown={d.noFix.rows.length} />
            </>
          )}
        </div>
        <div className="space-y-1">
          <DecisionHeading title={`Assets with findings over ${OVERDUE_LONG_DAYS} days past due`} total={d.longOverdue.total} tone="overdue" />
          {d.longOverdue.total === 0 ? none : (
            <>
              <Table
                head={["Asset", "Findings", "Oldest due date"]}
                numeric={[1]}
                rows={d.longOverdue.rows.map((r) => [<AssetLink key="a" asset={r} />, <Num key="o" value={r.alerts} tone="overdue" />, day(r.oldestDue)])}
              />
              <Shown total={d.longOverdue.total} shown={d.longOverdue.rows.length} />
            </>
          )}
        </div>
        <div className="space-y-1">
          <DecisionHeading title={`Assets not checked in the last ${SCAN_STALE_DAYS} days`} total={d.scanGaps.total} tone="overdue" />
          <p className="text-xs text-muted-foreground">Their findings may be out of date: the package list was not collected again, the vulnerability check did not run, or it failed.</p>
          {d.scanGaps.total === 0 ? none : (
            <>
              <Table
                head={["Asset", "Package list collected", "Last vulnerability check", "Last check failed"]}
                rows={d.scanGaps.rows.map((r) => [
                  <AssetLink key="a" asset={r} />, day(r.inventoryAt), day(r.lastScanAt),
                  r.lastScanFailed ? <span key="f" className={TONE_TEXT.overdue}>Yes</span> : "–",
                ])}
              />
              <Shown total={d.scanGaps.total} shown={d.scanGaps.rows.length} />
            </>
          )}
        </div>
        <div className="space-y-1">
          <DecisionHeading title="Malicious packages" total={d.malicious.total} tone="exploited" />
          {d.malicious.total === 0 ? none : (
            <>
              <Table
                head={["Asset", "Package", "Version", "Ecosystem", "ID"]}
                rows={d.malicious.rows.map((r) => [
                  <AssetLink key="a" asset={r} />, <span key="p" className={TONE_TEXT.exploited}>{r.packageName}</span>,
                  r.packageVersion, r.ecosystem, r.externalId,
                ])}
              />
              <Shown total={d.malicious.total} shown={d.malicious.rows.length} />
            </>
          )}
        </div>
      </div>
    </Section>
  )
}

/** The assets carrying a default tag: internet facing, or mission critical. */
function TaggedAssetsSection({ title, tag, x }: { title: string; tag: string; x: TaggedAssets }) {
  if (!x.tagFound) {
    return (
      <Section title={title}>
        <p className="text-sm text-muted-foreground">The {tag} tag is missing, so these assets cannot be shown.</p>
      </Section>
    )
  }
  return (
    <Section
      title={title}
      note={<>{n(x.assets)} assets carry the {tag} tag; <Num value={x.kev} tone="exploited" /> known exploited and <Num value={x.critical} tone="critical" /> Critical findings are open on them.</>}
    >
      {x.rows.length > 0 && (
        <Table
          head={["Asset", "Known exploited", "Critical", "Open", "First change to make"]}
          numeric={[1, 2, 3]}
          rows={x.rows.map((r) => [
            <AssetLink key="a" asset={r} />, <Num key="k" value={r.kev} tone="exploited" />, <Num key="c" value={r.critical} tone="critical" />,
            n(r.alerts), r.firstChange ? changeTitle(r.firstChange) : "No fix yet",
          ])}
        />
      )}
    </Section>
  )
}

function KeyNumbers({ report }: { report: ExecutiveReport }) {
  const all = report.scopes[0]
  const p = all.period
  const b = all.previous
  const count = (v: number | null) => v == null ? "–" : n(v)
  const onTime = (x: PeriodNumbers) => x.resolvedWithDue > 0 ? `${pct(x.onTimeRate)} (${n(x.resolvedOnTime)} of ${n(x.resolvedWithDue)})` : "–"
  const row = (label: string, pick: (x: PeriodNumbers) => number | null, format: (v: number | null) => string, higherIsBetter: boolean | null, diff: (v: number) => string = n) =>
    [label, format(pick(p)), format(pick(b)), <Change key="d" now={pick(p)} before={pick(b)} format={diff} higherIsBetter={higherIsBetter} />]
  // Counted at the end of each period: the end of the previous one is where this one starts.
  const atEnd = (label: string, series: number[]) => {
    const end = series.length >= 2 ? series[series.length - 1] : null
    const start = series.length >= 2 ? series[0] : null
    return [label, count(end), count(start), <Change key="d" now={end} before={start} higherIsBetter={false} />]
  }
  return (
    <Section
      title="Key numbers"
      note={`This period (${span(report.period)}) against the one before it (${span(report.previousPeriod)}). Open findings are counted at the end of each period; this one ends now.`}
    >
      <Table
        head={["", "This period", "Previous period", "Change"]}
        numeric={[1, 2, 3]}
        rows={[
          row("Findings detected", (x) => x.detected, count, false),
          row("Findings resolved", (x) => x.resolved, count, true),
          ["Resolved by the due date", onTime(p), onTime(b),
            <Change key="d" now={p.onTimeRate} before={b.onTimeRate} format={(v) => `${Math.round(v * 100)} pts`} higherIsBetter />],
          atEnd("Open and past the due date", all.trendOverdue),
          atEnd(`Open over ${AGED_DAYS} days`, all.trendAged),
          row("Median time to resolve, Critical", (x) => x.medianCriticalDays, days, false, (v) => v.toFixed(1)),
          row("Median time to resolve, High", (x) => x.medianHighDays, days, false, (v) => v.toFixed(1)),
          row("Accepted as a risk, any severity", (x) => x.accepted, count, null),
        ]}
      />
    </Section>
  )
}

function ByTag({ report }: { report: ExecutiveReport }) {
  return (
    <Section title="By asset tag" note="An asset with several tags is counted under each of them.">
      <Table
        head={["", "Assets", "Changes to make", "Open", "Known exploited", "Critical", "Overdue", "No fix yet", "Detected", "Resolved", "On time"]}
        numeric={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        rows={report.scopes.map((s) => [
          <span key="l" className={s.kind === "all" ? "font-semibold" : ""}>{s.label}</span>,
          n(s.assets), n(s.fixes.changes), n(s.open.alerts),
          <Num key="k" value={s.open.kev} tone="exploited" />, <Num key="c" value={s.open.critical} tone="critical" />,
          <Num key="o" value={s.open.overdue} tone="overdue" />, n(s.noFix.alerts),
          n(s.period.detected), n(s.period.resolved), pct(s.period.onTimeRate),
        ])}
      />
    </Section>
  )
}

function AcceptedRisks({ report }: { report: ExecutiveReport }) {
  const a = report.acceptedRisks
  return (
    <Section title="Accepted risks" note="Known exploited or Critical findings accepted as a risk, with who accepted them and why.">
      {a.total === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
        <>
          <Table
            head={["Asset", "Package", "Findings", "Known exploited", "Critical", "Accepted on", "By", "Reason"]}
            numeric={[2, 3, 4]}
            rows={a.rows.map((r) => [
              <AssetLink key="a" asset={r} />, r.target, n(r.alerts),
              <Num key="k" value={r.kev} tone="exploited" />, <Num key="c" value={r.critical} tone="critical" />,
              day(r.acceptedAt), r.acceptedBy ?? "–", r.reason ?? "–",
            ])}
          />
          <Shown total={a.total} shown={a.rows.length} />
        </>
      )}
    </Section>
  )
}

function TopAssets({ report }: { report: ExecutiveReport }) {
  return (
    <Section title="Assets most at risk" note="Ranked by known exploited, then Critical, then all open findings, with the change that would help most.">
      {report.topAssets.length === 0 ? <p className="text-sm text-muted-foreground">No findings are open.</p> : (
        <Table
          head={["Asset", "Known exploited", "Critical", "Open", "Changes to make", "First change to make"]}
          numeric={[1, 2, 3, 4]}
          rows={report.topAssets.map((r) => [
            <AssetLink key="a" asset={r} />,
            <Num key="k" value={r.kev} tone="exploited" />, <Num key="c" value={r.critical} tone="critical" />, n(r.alerts), n(r.changes),
            r.firstChange ? `${changeTitle(r.firstChange)} (${n(r.firstChange.alerts)} findings)` : "No fix yet",
          ])}
        />
      )}
    </Section>
  )
}

function Notes({ report }: { report: ExecutiveReport }) {
  return (
    <Section title="Notes">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>A finding is one vulnerability in one package on one asset. Open means open or in progress.</li>
        <li>A change to make is one update or upgrade that resolves a group of findings, as on an asset&apos;s Remediation tab. Changes are worked out from the findings as they are now, so they are not compared with the previous period.</li>
        <li>Known exploited means listed in CISA&apos;s Known Exploited Vulnerabilities catalog.</li>
        <li>A crown marks an asset tagged {MISSION_CRITICAL_TAG}, a globe one tagged {INTERNET_FACING_TAG}.</li>
        <li>Past counts are rebuilt from each finding&apos;s history of status changes, VEX imports included.</li>
        <li>Long overdue means over {OVERDUE_LONG_DAYS} days past the due date; not checked means no package list or vulnerability check in the last {SCAN_STALE_DAYS} days.</li>
        <li>Finding data (severity, exploitation) was last refreshed {report.lastMetadataRefresh ? moment(report.lastMetadataRefresh) : "never"}.</li>
      </ul>
    </Section>
  )
}

export function ExecutiveReportView({ report }: { report: ExecutiveReport }) {
  const all = report.scopes[0]
  const trend = report.trendPoints.map((p, i) => ({ day: formatDay(p).slice(5), open: all.trend[i] }))
  return (
    <article className="mx-auto max-w-[760px] space-y-6 rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Executive summary</h1>
        <p className="text-sm text-muted-foreground">
          {report.tags.length === 0 ? "All assets" : `Assets tagged ${report.tags.map((t) => t.name).join(", ")}`}.
          {" "}The {periodDays(report.period)} days up to {moment(report.generatedAt)} ({span(report.period)}), compared with the {periodDays(report.previousPeriod)} days before ({span(report.previousPeriod)}).
        </p>
      </header>

      <Section title="Summary">
        <div className="space-y-1 text-sm">
          {summaryLines(report).map((line) => <p key={line}>{line}</p>)}
        </div>
      </Section>
      <CommentBox />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Changes to make" value={all.fixes.changes} sub={`would resolve ${n(all.fixes.alerts)} findings`} />
        <Tile label="Open findings" value={all.open.alerts} sub={<>on {n(all.assets)} assets, <Num value={all.open.overdue} tone="overdue" /> overdue</>} />
        <Tile label="Known exploited" value={all.open.kev} tone="exploited" sub={<><Num value={all.open.critical} tone="critical" /> Critical</>} />
        <Tile label="No fix yet" value={all.noFix.alerts} sub={<><Num value={all.noFix.kev} tone="exploited" /> known exploited</>} />
      </div>

      <Decisions report={report} />
      <TaggedAssetsSection title="Exposed to the internet" tag={INTERNET_FACING_TAG} x={report.internetFacing} />
      <TaggedAssetsSection title="Mission critical assets" tag={MISSION_CRITICAL_TAG} x={report.missionCritical} />
      <KeyNumbers report={report} />

      <div className="space-y-6 print:break-before-page">
        <ByTag report={report} />
        <Section title="Open findings over the period">
          <OpenTrendChart data={trend} />
        </Section>
        <AcceptedRisks report={report} />
        <TopAssets report={report} />
        <Notes report={report} />
      </div>
    </article>
  )
}
