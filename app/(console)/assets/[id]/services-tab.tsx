"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react"
import { FaTriangleExclamation } from "react-icons/fa6"
import { Badge } from "@/components/ui/badge"
import { SeverityCountBadges } from "@/components/alerts/severity-count-badges"
import { isService, type CommonGroup, type NotLoadedGroup, type PackageGroup, type RestartNeed, type ServiceRow, type ServicesView } from "@/lib/services-view"

type ServicesResponse = ServicesView & { sbomTool: string | null }

function KevIcon({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span title={`${count} CISA Known Exploited ${count === 1 ? "Vulnerability" : "Vulnerabilities"}`}>
      <FaTriangleExclamation className="h-4 w-4 text-red-600" />
    </span>
  )
}

const RESTART_TEXT: Record<RestartNeed, string> = {
  yes: "Runs a replaced file of this package: restart it for the upgrade to take effect.",
  maybe: "A process using this package runs a replaced file of it. The SBOM, from a heretix-cli before 0.7.1, does not say which.",
}

function RestartBadge({ need, groups }: { need: RestartNeed; groups?: string[] }) {
  const title = groups && groups.length > 0 ? `${RESTART_TEXT[need]} (${groups.join(", ")})` : RESTART_TEXT[need]
  return (
    <span title={title}>
      <Badge variant="outline" className="gap-1 text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800">
        <RotateCw className="h-3 w-3" />
        {need === "yes" ? "Restart" : "Restart?"}
      </Badge>
    </span>
  )
}

/** The Alerts list narrowed to this asset and one package version. */
function alertsHref(assetId: string, p: { name: string; version: string }): string {
  const q = new URLSearchParams({ assetId, packageName: p.name, packageVersion: p.version })
  return `/alerts?${q}`
}

function GroupPackages({ assetId, group }: { assetId: string; group: PackageGroup }) {
  return (
    <span className="text-xs text-muted-foreground">
      {group.packages.map((p, i) => (
        <Fragment key={`${p.name}@${p.version}`}>
          {i > 0 && ", "}
          <Link href={alertsHref(assetId, p)} className="hover:underline" title="Open this package's alerts">
            {p.name} {p.version}
          </Link>
        </Fragment>
      ))}
    </span>
  )
}

function vulnsLabel(n: number): string {
  return `${n} ${n === 1 ? "vulnerability" : "vulnerabilities"}`
}

/** The running kernel, or the libraries most services load: one row per source package. */
function GroupBox({ title, note, groups, assetId, loadedBy, collapsible }: {
  title: string
  note: string
  groups: (PackageGroup | CommonGroup | NotLoadedGroup)[]
  assetId: string
  loadedBy?: number
  /** Closed until opened: for a list that is background, not what needs doing. */
  collapsible?: boolean
}) {
  if (groups.length === 0) return null
  const Wrapper = collapsible ? "details" : "div"
  const Head = collapsible ? "summary" : "div"
  return (
    <Wrapper className="rounded-md border px-4 py-3 space-y-2">
      <Head className={collapsible ? "cursor-pointer" : undefined}>
        <h3 className="inline text-sm font-semibold">{title}{collapsible ? ` (${groups.length})` : ""}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </Head>
      <div className="divide-y">
        {groups.map((g) => (
          <div key={g.key} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-medium">{g.key}</div>
              <GroupPackages assetId={assetId} group={g} />
              {"partlyLoaded" in g && g.partlyLoaded && (
                <p className="text-xs text-muted-foreground">Other packages of this source package are loaded; only these are not.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {"loadedBy" in g && loadedBy !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">{g.loadedBy} of {loadedBy} services</span>
              )}
              <KevIcon count={g.kev} />
              <SeverityCountBadges counts={g.severities} />
              <span className="w-32 text-right text-sm tabular-nums">{vulnsLabel(g.vulns)}</span>
            </div>
          </div>
        ))}
      </div>
    </Wrapper>
  )
}

function ServiceLine({ row, assetId }: { row: ServiceRow; assetId: string }) {
  const [open, setOpen] = useState(false)
  const restartYes = row.restart.filter((r) => r.need === "yes")
  const need: RestartNeed | null = restartYes.length > 0 ? "yes" : row.restart.length > 0 ? "maybe" : null
  const preview = row.groups.slice(0, 3).map((g) => g.key)
  return (
    <div className="rounded-md border px-4 py-3">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {row.kind === "process" && (
              <Badge variant="outline" className="text-xs text-muted-foreground" title="A process outside a systemd unit, named by its command">process</Badge>
            )}
            {need && <RestartBadge need={need} groups={row.restart.map((r) => r.group)} />}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.groups.length === 0
              ? "No vulnerable packages of its own"
              : `${preview.join(", ")}${row.groups.length > preview.length ? `, and ${row.groups.length - preview.length} more` : ""}`}
            {row.commonLoaded > 0 && ` · also ${row.commonLoaded} of the common libraries`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <KevIcon count={row.kev} />
          {row.vulns > 0 && <SeverityCountBadges counts={row.severities} />}
          <span className="w-32 text-right text-sm tabular-nums">{vulnsLabel(row.vulns)}</span>
        </div>
      </button>
      {open && row.groups.length > 0 && (
        <div className="mt-2 divide-y border-t pl-7">
          {row.groups.map((g) => (
            <div key={g.key} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{g.key}</span>
                  {g.restart && <RestartBadge need={g.restart} />}
                </div>
                <GroupPackages assetId={assetId} group={g} />
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted-foreground tabular-nums" title="Vulnerabilities with a fixed version">
                  {g.fixable} of {g.vulns} fixable
                </span>
                <KevIcon count={g.kev} />
                <SeverityCountBadges counts={g.severities} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The asset's findings by the services that run the vulnerable code, from what heretix-cli
 * read in /proc when it collected the asset (see lib/services-view.ts).
 */
export function ServicesTab({ assetId }: { assetId: string }) {
  const [data, setData] = useState<ServicesResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/assets/${assetId}/services`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: ServicesResponse) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [assetId])

  if (error) return <p className="text-sm text-destructive">The services could not be loaded.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>

  const services = data.rows.filter(isService)
  const others = data.rows.filter((r) => !isService(r))
  const servicesWithFindings = data.rows.filter((r) => r.vulns > 0 || r.commonLoaded > 0).length
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-base">
          <strong className="text-lg font-semibold">{servicesWithFindings}</strong> of {data.services} services and processes had vulnerable packages loaded.{" "}
          <strong className="text-lg font-semibold text-amber-700 dark:text-amber-400">{data.vulnerableInUse}</strong> vulnerable packages were in use,{" "}
          <strong className="text-lg font-semibold text-green-700 dark:text-green-400">{data.vulnerableNotLoaded}</strong> installed but not loaded, and{" "}
          <strong className="text-lg font-semibold">{data.vulnerableUndetermined}</strong> not determined
          (no program or library of their own).
        </p>
        <p className="text-xs text-muted-foreground">
          From the processes running when the SBOM was collected{data.sbomTool ? ` (${data.sbomTool})` : ""}. A program
          that runs now and then is not seen. Findings are counted by vulnerability, once per source package.
        </p>
      </div>

      <GroupBox
        title="Running kernel"
        note="Used by the host itself, not by one service."
        groups={data.kernel}
        assetId={assetId}
      />
      <GroupBox
        title="Loaded by most services"
        note="Libraries at least half of the services load, shown here once instead of on every service."
        groups={data.common}
        assetId={assetId}
        loadedBy={data.services}
      />

      <GroupBox
        title="Installed but not loaded"
        note="Vulnerable packages that no process had loaded when heretix-cli collected the asset, by source package. A program that runs now and then is not seen, so this does not mean they are never used."
        groups={data.notLoaded}
        assetId={assetId}
        collapsible
      />

      {services.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Services</h3>
          {services.map((row) => <ServiceLine key={row.name} row={row} assetId={assetId} />)}
        </div>
      )}
      {others.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Other processes</h3>
            <p className="text-xs text-muted-foreground">
              Login sessions and containers (systemd scopes), and commands that run outside a systemd unit.
            </p>
          </div>
          {others.map((row) => <ServiceLine key={row.name} row={row} assetId={assetId} />)}
        </div>
      )}
    </div>
  )
}
