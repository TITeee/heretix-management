"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react"
import { FaCircleExclamation, FaClock, FaCircleCheck, FaCircleMinus } from "react-icons/fa6"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  ignored: "Ignored",
}

const STATUS_ICON_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  open:        { icon: FaCircleExclamation, className: "h-3 w-3 text-red-500" },
  in_progress: { icon: FaClock,            className: "h-3 w-3 text-blue-500" },
  resolved:    { icon: FaCircleCheck,      className: "h-3 w-3 text-green-600" },
  ignored:     { icon: FaCircleMinus,      className: "h-3 w-3 text-muted-foreground" },
}

function StatusLabel({ value }: { value: string }) {
  const entry = STATUS_ICON_MAP[value]
  const label = STATUS_LABELS[value] ?? value
  if (!entry) return <span>{label}</span>
  const Icon = entry.icon
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={entry.className} />
      {label}
    </span>
  )
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  detected:         { label: "Detected",        variant: "destructive" },
  status_changed:   { label: "Status Changed",  variant: "default" },
  cvss_changed:     { label: "CVSS Changed",    variant: "secondary" },
  severity_changed: { label: "Severity Changed",variant: "secondary" },
  kev_added:        { label: "KEV Added",       variant: "secondary" },
  epss_changed:     { label: "EPSS Updated",    variant: "outline" },
  notes_saved:      { label: "Notes Saved",     variant: "secondary" },
}

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_CONFIG).map(([value, { label }]) => ({ value, label }))

type AlertEvent = {
  id: string
  type: string
  data: Record<string, unknown> | null
  createdAt: string
  alert: {
    externalId: string
    packageName: string
    packageVersion: string
    asset: { id: string; name: string; hostname: string }
  }
}

function To() {
  return <span className="text-muted-foreground">to</span>
}

function EventChange({ type, data }: { type: string; data: Record<string, unknown> | null }) {
  if (!data) return <span className="text-muted-foreground"></span>
  switch (type) {
    case "status_changed":
      return (
        <span className="inline-flex items-center gap-1.5">
          <StatusLabel value={data.from as string} />
          <To />
          <StatusLabel value={data.to as string} />
        </span>
      )
    case "cvss_changed":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{String(data.from ?? "n/a")}</span>
          <To />
          <span>{String(data.to ?? "n/a")}</span>
        </span>
      )
    case "severity_changed":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{String(data.from ?? "n/a")}</span>
          <To />
          <span>{String(data.to ?? "n/a")}</span>
        </span>
      )
    case "epss_changed": {
      const from = data.percentileFrom != null ? `${((data.percentileFrom as number) * 100).toFixed(1)}%ile` : String(data.from ?? "n/a")
      const to = data.percentileTo != null ? `${((data.percentileTo as number) * 100).toFixed(1)}%ile` : String(data.to ?? "n/a")
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{from}</span>
          <To />
          <span>{to}</span>
        </span>
      )
    }
    default:
      return <span className="text-muted-foreground"></span>
  }
}

const PAGE_SIZE = 50

export function ActivityTable({ events: allEvents }: { events: AlertEvent[] }) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [assetFilter, setAssetFilter] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  const assetOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of allEvents) {
      if (!seen.has(e.alert.asset.id)) {
        seen.set(e.alert.asset.id, e.alert.asset.name || e.alert.asset.hostname)
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allEvents])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allEvents.filter((e) => {
      if (typeFilter.size > 0 && !typeFilter.has(e.type)) return false
      if (assetFilter.size > 0 && !assetFilter.has(e.alert.asset.id)) return false
      if (q) {
        const hit =
          e.alert.externalId.toLowerCase().includes(q) ||
          e.alert.packageName.toLowerCase().includes(q)
        if (!hit) return false
      }
      return true
    })
  }, [allEvents, search, typeFilter, assetFilter])

  const hasFilter = search.length > 0 || typeFilter.size > 0 || assetFilter.size > 0

  function resetAllFilters() {
    setSearch("")
    setTypeFilter(new Set())
    setAssetFilter(new Set())
    setPage(0)
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function handleTypeFilter(next: Set<string>) {
    setTypeFilter(next)
    setPage(0)
  }
  function handleSearch(v: string) {
    setSearch(v)
    setPage(0)
  }
  function handleAssetFilter(next: Set<string>) {
    setAssetFilter(next)
    setPage(0)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by vuln ID or package..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-64"
        />
        <DataTableFacetedFilter
          title="Event"
          options={EVENT_TYPE_OPTIONS}
          selected={typeFilter}
          onSelectedChange={handleTypeFilter}
        />
        <DataTableFacetedFilter
          title="Asset"
          options={assetOptions}
          selected={assetFilter}
          onSelectedChange={handleAssetFilter}
          searchable
        />
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={resetAllFilters}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date / Time</th>
              <th className="px-3 py-2 text-left font-medium">Event</th>
              <th className="px-3 py-2 text-left font-medium">Change</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Vuln ID</th>
              <th className="px-3 py-2 text-left font-medium">Package</th>
              <th className="px-3 py-2 text-left font-medium">Asset</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-24 text-center text-muted-foreground">No events found.</td>
              </tr>
            ) : (
              pageRows.map((e) => {
                const config = EVENT_TYPE_CONFIG[e.type]
                const assetLabel = e.alert.asset.name || e.alert.asset.hostname
                return (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {config ? (
                        <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{e.type}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <EventChange type={e.type} data={e.data} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.alert.externalId}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.alert.packageName}{" "}
                      <span className="text-muted-foreground">{e.alert.packageVersion}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Link href={`/assets/${e.alert.asset.id}`} className="hover:underline text-primary">
                        {assetLabel}
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-foreground">
        <span>{filtered.length} event(s) total</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(0)} disabled={safePage === 0}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>Page {safePage + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
