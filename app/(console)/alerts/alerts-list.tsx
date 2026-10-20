"use client"

import React, { useMemo, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { SortingState } from "@tanstack/react-table"
import { Download, X } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertDetailSheet, StatusIcon, statusColorClass, StatusOptionLabel } from "@/components/alerts/alert-detail-sheet"
import { STATUS_LABELS } from "@/lib/severity"
import { fixStatusLabel, fixStatusSortKey } from "@/lib/fix-status"
import { cn } from "@/lib/utils"
import type { Alert } from "@/lib/alerts/list-filters"
import type { AlertListFacets } from "@/lib/alerts/query"
import {
  type AlertQuery, type SortColumn, DEFAULT_SORT, NONE, SORT_COLUMNS, alertQueryToSearchParams, parseAlertQuery,
} from "@/lib/alerts/query-params"
import { CVSS_OPTIONS, DUE_OPTIONS, KEV_OPTIONS, STATUS_OPTIONS, buildColumns } from "./alerts-table"
import { AlertsMoreMenu } from "./alerts-more-menu"

// Links can ask for alerts with no rating at all (the asset page's N/A badge).
const SEVERITY_OPTIONS = [...CVSS_OPTIONS, { value: "na", label: "N/A" }]

const DEPENDENCY_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "indirect", label: "Indirect" },
]

const INVENTORY_OPTIONS = [
  { value: "missing", label: "Not in inventory" },
  { value: "present", label: "In inventory" },
]

type ListFilterKey =
  | "assetIds" | "statuses" | "severityTiers" | "risks" | "ecosystems" | "sources" | "tagIds"
  | "dependencies" | "inventories" | "dues" | "distroLabels" | "fixStatuses"

/**
 * The Alerts list: one page the server fetched (lib/alerts/query.ts), with
 * every filter, the searches, the sort and the page in the URL, so a view can
 * be linked to and the back button works.
 */
export function AlertsList({ rows, total, query, facets, slaEnabled, hasVex }: {
  rows: Alert[]
  total: number
  query: AlertQuery
  facets: AlertListFacets
  slaEnabled: boolean
  hasVex: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Alert | null>(null)
  const [open, setOpen] = useState(false)
  const [selectedAlerts, setSelectedAlerts] = useState<Alert[]>([])
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)

  function navigate(next: AlertQuery) {
    const search = alertQueryToSearchParams(next).toString()
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }))
  }

  /** A filter changed: back to the first page. */
  function setFilter(key: ListFilterKey, values: Set<string>) {
    navigate({ ...query, [key]: [...values], page: 1 })
  }

  const assetOptions = useMemo(
    () => facets.assets.map((a) => ({ value: a.id, label: a.name || a.hostname })),
    [facets.assets]
  )
  const ecosystemOptions = useMemo(() => facets.ecosystems.map((e) => ({ value: e, label: e })), [facets.ecosystems])
  const sourcesOptions = useMemo(() => facets.sources.map((s) => ({ value: s, label: s.toUpperCase() })), [facets.sources])
  const tagOptions = useMemo(() => facets.tags.map((t) => ({ value: t.id, label: t.name })), [facets.tags])
  // As the old list: one option per rating present, plus None; hidden when there are none.
  const distroOptions = useMemo(
    () => facets.distroLabels.length
      ? [...facets.distroLabels.map((l) => ({ value: l, label: l })), { value: NONE, label: "None" }]
      : [],
    [facets.distroLabels]
  )
  const fixStatusOptions = useMemo(
    () => facets.fixStatuses.length
      ? [
          ...[...facets.fixStatuses]
            .sort((x, y) => fixStatusSortKey(x)! - fixStatusSortKey(y)! || x.localeCompare(y))
            .map((s) => ({ value: s, label: fixStatusLabel(s)! })),
          { value: NONE, label: "None" },
        ]
      : [],
    [facets.fixStatuses]
  )

  const defaults = parseAlertQuery({})
  const hasFilter =
    query.assetIds.length > 0 || query.severityTiers.length > 0 || query.risks.length > 0 || query.ecosystems.length > 0 ||
    query.sources.length > 0 || query.tagIds.length > 0 || query.dependencies.length > 0 || query.inventories.length > 0 ||
    query.dues.length > 0 || query.distroLabels.length > 0 || query.fixStatuses.length > 0 ||
    query.packageName !== null || query.packageVersion !== null ||
    query.statuses.join(",") !== defaults.statuses.join(",")

  // A status changed from a row or the detail sheet shows at once; the server's
  // own copy replaces it on the next load (a row's select reloads when saved,
  // the sheet when it closes).
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})
  const [overridesFor, setOverridesFor] = useState(rows)
  if (overridesFor !== rows) {
    setOverridesFor(rows)
    setStatusOverrides({})
  }
  const shownRows = useMemo(() => {
    if (Object.keys(statusOverrides).length === 0) return rows
    const apply = (a: Alert): Alert => (statusOverrides[a.id] ? { ...a, status: statusOverrides[a.id] } : a)
    return rows.map((r) => ({ ...apply(r), ...(r._groupMembers ? { _groupMembers: r._groupMembers.map(apply) } : {}) }))
  }, [rows, statusOverrides])

  function handleStatusChange(alertId: string, status: string) {
    setStatusOverrides((prev) => ({ ...prev, [alertId]: status }))
    setSelected((prev) => (prev?.id === alertId ? { ...prev, status } : prev))
  }

  function handleSheetOpenChange(next: boolean) {
    setOpen(next)
    if (!next && Object.keys(statusOverrides).length > 0) router.refresh()
  }

  const columns = useMemo(() => buildColumns(handleStatusChange), [])

  async function handleBulkStatusChange() {
    if (!bulkStatus || selectedAlerts.length === 0) return
    setBulkLoading(true)
    await Promise.all(
      selectedAlerts.map((alert) =>
        fetch(`/api/alerts/${alert.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: bulkStatus }),
        })
      )
    )
    setBulkStatus("")
    setBulkLoading(false)
    router.refresh()
  }

  const exportParams = alertQueryToSearchParams({ ...query, page: 1 })
  const exportHref = (format: "csv" | "json") => {
    exportParams.set("format", format)
    return `/api/alerts/export?${exportParams}`
  }

  const sorting: SortingState = [{ id: query.sort.column, desc: query.sort.desc }]

  return (
    <div className="space-y-4">
      <AlertsMoreMenu hasVex={hasVex} vexAssetId={query.assetIds.length === 1 ? query.assetIds[0] : undefined} />

      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter title="Asset" options={assetOptions} selected={new Set(query.assetIds)} onSelectedChange={(v) => setFilter("assetIds", v)} searchable />
        <DataTableFacetedFilter title="Status" options={STATUS_OPTIONS} selected={new Set(query.statuses)} onSelectedChange={(v) => setFilter("statuses", v)} />
        <DataTableFacetedFilter title="Severity" options={SEVERITY_OPTIONS} selected={new Set(query.severityTiers)} onSelectedChange={(v) => setFilter("severityTiers", v)} />
        {distroOptions.length > 0 && (
          <DataTableFacetedFilter title="Distro Rating" options={distroOptions} selected={new Set(query.distroLabels)} onSelectedChange={(v) => setFilter("distroLabels", v)} searchable />
        )}
        {fixStatusOptions.length > 0 && (
          <DataTableFacetedFilter title="Fix Status" options={fixStatusOptions} selected={new Set(query.fixStatuses)} onSelectedChange={(v) => setFilter("fixStatuses", v)} />
        )}
        <DataTableFacetedFilter title="Risk" options={KEV_OPTIONS} selected={new Set(query.risks)} onSelectedChange={(v) => setFilter("risks", v)} />
        <DataTableFacetedFilter title="Ecosystem" options={ecosystemOptions} selected={new Set(query.ecosystems)} onSelectedChange={(v) => setFilter("ecosystems", v)} searchable />
        <DataTableFacetedFilter title="Sources" options={sourcesOptions} selected={new Set(query.sources)} onSelectedChange={(v) => setFilter("sources", v)} />
        <DataTableFacetedFilter title="Tags" options={tagOptions} selected={new Set(query.tagIds)} onSelectedChange={(v) => setFilter("tagIds", v)} searchable />
        <DataTableFacetedFilter title="Dependency" options={DEPENDENCY_OPTIONS} selected={new Set(query.dependencies)} onSelectedChange={(v) => setFilter("dependencies", v)} />
        <DataTableFacetedFilter title="Inventory" options={INVENTORY_OPTIONS} selected={new Set(query.inventories)} onSelectedChange={(v) => setFilter("inventories", v)} />
        {slaEnabled && (
          <DataTableFacetedFilter title="Due" options={DUE_OPTIONS} selected={new Set(query.dues)} onSelectedChange={(v) => setFilter("dues", v)} />
        )}
        {/* Exact matches other screens link with, shown so the narrowing is never invisible. */}
        {query.packageName && (
          <FilterChip label={`Package: ${query.packageName}`} onRemove={() => navigate({ ...query, packageName: null, page: 1 })} />
        )}
        {query.packageVersion && (
          <FilterChip label={`Version: ${query.packageVersion}`} onRemove={() => navigate({ ...query, packageVersion: null, page: 1 })} />
        )}
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => navigate(defaults)}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={shownRows}
        filterColumn="packageName"
        filterPlaceholder="Search by package name..."
        secondFilterColumn="externalId"
        secondFilterPlaceholder="Vuln ID..."
        onRowClick={(row) => { setSelected(row); setOpen(true) }}
        enableRowSelection
        getRowId={(row) => row.id}
        onRowSelectionChange={(selectedRows) => setSelectedAlerts(selectedRows.flatMap((r) => r._groupMembers ?? [r]))}
        initialColumnVisibility={{ updatedAt: false, sources: false, dueDate: false, distroPriority: false, fixStatus: false }}
        server={{
          rowCount: total,
          pageIndex: query.page - 1,
          pageSize: query.pageSize,
          sorting,
          search: { first: query.q ?? "", second: query.vuln ?? "" },
          pending,
          onPageChange: (pageIndex) => navigate({ ...query, page: pageIndex + 1 }),
          onPageSizeChange: (pageSize) => navigate({ ...query, pageSize, page: 1 }),
          onSortingChange: (next) => {
            const s = next[0]
            const column = s && (SORT_COLUMNS as readonly string[]).includes(s.id) ? (s.id as SortColumn) : null
            navigate({ ...query, sort: column ? { column, desc: s.desc } : DEFAULT_SORT, page: 1 })
          },
          onSearchChange: (which, value) => {
            const text = value.trim() || null
            navigate(which === "first" ? { ...query, q: text, page: 1 } : { ...query, vuln: text, page: 1 })
          },
        }}
        headerActions={
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <Download className="h-4 w-4" />
                Export
              </button>
              <div className="absolute right-0 top-full z-10 mt-1 hidden group-focus-within:flex group-hover:flex flex-col rounded-md border bg-popover shadow-md min-w-30">
                <a href={exportHref("csv")} className="px-3 py-2 text-sm text-left hover:bg-accent rounded-t-md">CSV</a>
                <a href={exportHref("json")} className="px-3 py-2 text-sm text-left hover:bg-accent rounded-b-md">JSON</a>
              </div>
            </div>
            {selectedAlerts.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{selectedAlerts.length} selected</span>
                <Select value={bulkStatus} onValueChange={(v) => { if (v) setBulkStatus(v) }}>
                  <SelectTrigger className="h-8 w-44 text-sm">
                    <span className="flex items-center gap-1.5">
                      {bulkStatus && <StatusIcon status={bulkStatus} />}
                      <SelectValue>
                        {bulkStatus
                          ? <span className={statusColorClass(bulkStatus)}>{STATUS_LABELS[bulkStatus] ?? bulkStatus}</span>
                          : <span className="text-muted-foreground">Change status...</span>}
                      </SelectValue>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open"><StatusOptionLabel status="open" label="Open" /></SelectItem>
                    <SelectItem value="in_progress"><StatusOptionLabel status="in_progress" label="In Progress" /></SelectItem>
                    <SelectItem value="resolved"><StatusOptionLabel status="resolved" label="Resolved" /></SelectItem>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger render={
                          <SelectItem value="ignored" disabled className="data-disabled:pointer-events-auto">
                            <StatusOptionLabel status="ignored" label="Ignored" />
                          </SelectItem>
                        } />
                        <TooltipContent side="right">
                          Ignoring an alert requires a reason — set it from the alert detail panel
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleBulkStatusChange} disabled={!bulkStatus || bulkLoading}>
                  {bulkLoading ? "Applying..." : "Apply"}
                </Button>
              </>
            )}
          </div>
        }
      />
      <AlertDetailSheet
        key={selected?.id}
        alert={selected}
        group={selected?._groupMembers && {
          sourcePackage: selected.sourcePackage ?? selected.packageName,
          members: selected._groupMembers.map((m) => ({ id: m.id, packageName: m.packageName })),
        }}
        open={open}
        onOpenChange={handleSheetOpenChange}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-sm">
      {label}
      <button type="button" onClick={onRemove} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${label}`}>
        <X className="size-3.5" />
      </button>
    </span>
  )
}
