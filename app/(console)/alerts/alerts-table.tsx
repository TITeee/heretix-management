"use client"

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Badge } from "@/components/ui/badge"
import { TagBadge } from "@/components/tags/tag-badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { STATUS_LABELS, getAlertSeverityTier } from "@/lib/severity"
import { SeverityBadge } from "@/components/alerts/vuln-detail-tabs"
import { AlertDetailSheet, StatusIcon, statusColorClass, statusSelectStyle, StatusOptionLabel } from "@/components/alerts/alert-detail-sheet"
import { formatDaysUntilDue, getSlaStatus } from "@/lib/sla"
import { distroPriorityLabel, distroPrioritySortKey } from "@/lib/distro-priority"
import { fixStatusLabel, fixStatusSortKey } from "@/lib/fix-status"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowUpDown, Check, ChevronDown, ChevronRight, CircleHelp, Download, X } from "lucide-react"
import { FaTriangleExclamation, FaVirus } from "react-icons/fa6"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { type Alert, NONE_OPTION, groupBySourcePackage, matchesListFilters } from "@/lib/alerts/list-filters"
import { alertCsvHeaderLine, alertCsvLine, alertJsonRecord, exportFilename } from "@/lib/alerts/export-format"

export type { Alert }

function StatusSelect({ alertIds, currentStatus, onStatusChange }: {
  // One id for a normal row, or every sibling's id when the row is a
  // collapsed source-package group — a grouped row must act on all of them,
  // the same way bulk actions and export already resolve through
  // _groupMembers, or changing status here would silently touch only the
  // representative alert while its siblings stay open.
  alertIds: string[]
  currentStatus: string
  onStatusChange?: (id: string, status: string) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)

  async function onChange(value: string | null) {
    if (!value) return
    setStatus(value)
    for (const id of alertIds) onStatusChange?.(id, value)
    setLoading(true)
    await Promise.all(alertIds.map(id =>
      fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      })
    ))
    setLoading(false)
    router.refresh()
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className="h-7 w-32 text-xs" style={statusSelectStyle(status)}>
        <span className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          <span className={statusColorClass(status)}>
            <SelectValue>{STATUS_LABELS[status] ?? status}</SelectValue>
          </span>
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
  )
}



// Which collapsed source-package rows are open (by the row's ID). The Package and Alert ID cells of a
// row read it, so opening one lines the distro packages up with their IDs in the other.
const GroupExpansionContext = createContext<{ expanded: Set<string>; toggle: (id: string) => void }>({
  expanded: new Set(),
  toggle: () => {},
})

// Holds that state for a table. Wrap the DataTable in it wherever buildColumns' columns are used.
export function GroupExpansionProvider({ children }: { children: React.ReactNode }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const value = useMemo(() => ({
    expanded: expandedGroups,
    toggle: (id: string) => setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }),
  }), [expandedGroups])
  return <GroupExpansionContext.Provider value={value}>{children}</GroupExpansionContext.Provider>
}

// The columns that start hidden, for every table built from buildColumns (the Alerts list and its legacy page).
export const DEFAULT_COLUMN_VISIBILITY = { updatedAt: false, sources: false, dueDate: false, distroPriority: false, fixStatus: false, alertId: false }

function GroupedPackageCell({ groupId, sourcePackage, version, members }: {
  groupId: string
  sourcePackage: string
  version: string
  members: Alert[]
}) {
  const { expanded: open, toggle } = useContext(GroupExpansionContext)
  const expanded = open.has(groupId)
  return (
    <div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(groupId) }}
        className="flex items-center gap-1 font-medium hover:underline"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {sourcePackage} <span className="text-muted-foreground font-normal">({members.length})</span>
      </button>
      <div className="text-xs text-muted-foreground">{version}</div>
      {expanded && (
        <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
          {members.map(m => <li key={m.id}>{m.packageName}</li>)}
        </ul>
      )}
    </div>
  )
}

// Whether a fixed version is known for the alert: a check, with the version in the tooltip, and
// nothing when there is none. A collapsed source-package row stands for several alerts that can differ,
// so it shows a check only when every one has a fix, and "n/N" when some do.
function FixedInCell({ alert }: { alert: Alert }) {
  const members = alert._groupMembers ?? [alert]
  const fixed = members.filter((m) => m.fixedVersion)
  const versions = [...new Set(fixed.map((m) => m.fixedVersion as string))]
  if (fixed.length === 0) return null
  if (fixed.length === members.length) {
    return <span title={`Fixed version: ${versions.join(", ")}`}><Check className="h-4 w-4 text-green-600 dark:text-green-400" /></span>
  }
  return (
    <span className="text-xs text-muted-foreground" title={`${fixed.length} of ${members.length} have a fixed version: ${versions.join(", ")}`}>
      {fixed.length}/{members.length}
    </span>
  )
}

// The Alert ID of a collapsed source-package row. The group has no ID of its own (the alerts are
// the distro packages), so it shows how many there are, and clicking it opens the row like the
// Package cell does; opened, each distro package's ID sits on the line of its name in the Package
// cell, which is laid out the same way.
function GroupedAlertIdCell({ groupId, members }: { groupId: string; members: Alert[] }) {
  const { expanded: open, toggle } = useContext(GroupExpansionContext)
  const expanded = open.has(groupId)
  return (
    <div>
      {/* Opens and closes the row like the Package cell's button does. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(groupId) }}
        className="flex items-center gap-1 text-muted-foreground hover:underline"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {members.length} alerts
      </button>
      <div className="text-xs">&nbsp;</div>
      {expanded && (
        <ul className="mt-1 text-xs">
          {members.map(m => (
            <li key={m.id} className="font-mono select-all" onClick={(e) => e.stopPropagation()}>{m.id}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function buildColumns(onStatusChange: (id: string, status: string) => void): ColumnDef<Alert>[] {
  return [
  {
    // The alert's own ID, for quoting it or looking it up. The first column; hidden by default (see
    // initialColumnVisibility). A collapsed source-package row has no ID of its own.
    id: "alertId",
    accessorFn: (row) => row.id,
    header: "Alert ID",
    cell: ({ row }) => {
      const members = row.original._groupMembers
      if (members && members.length > 1) return <GroupedAlertIdCell groupId={row.original.id} members={members} />
      // A click selects the ID to copy it, and does not open the alert's panel.
      return (
        <span className="font-mono text-xs select-all" onClick={(e) => e.stopPropagation()}>
          {row.original.id}
        </span>
      )
    },
  },
  {
    accessorKey: "cvssScore",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        CVSS <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <SeverityBadge severity={row.original.severity} score={row.original.cvssScore} />,
  },
  {
    // Next to CVSS so a gap between the CVE-wide rating and the distro's own
    // (NVD 9.8, Red Hat "low") is visible without opening the alert. Sorts by
    // distro, then severity on that distro's own scale; unrated rows stay last.
    id: "distroPriority",
    accessorFn: (row) => distroPrioritySortKey(row.ecosystem, row.distroPriority),
    sortUndefined: "last",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Distro Rating <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const label = distroPriorityLabel(row.original.ecosystem, row.original.distroPriority)
      return label
        ? <span className="text-xs whitespace-nowrap">{label}</span>
        : <span className="text-xs text-muted-foreground">None</span>
    },
  },
  {
    // Why there is no fix: the difference between "wait for it" (deferred)
    // and "accept it now" (will not fix). Sorts from a fix may still come to
    // no fix will come; rows without one stay last.
    id: "fixStatus",
    accessorFn: (row) => fixStatusSortKey(row.fixStatus),
    sortUndefined: "last",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Fix Status <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const label = fixStatusLabel(row.original.fixStatus)
      return label
        ? <span className="text-xs whitespace-nowrap" title={row.original.fixStatusDetail ?? undefined}>{label}</span>
        : <span className="text-xs text-muted-foreground">None</span>
    },
  },
  {
    accessorKey: "isKev",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Risk <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex gap-1.5">
        {row.original.isKev && (
          <span title="CISA Known Exploited Vulnerability">
            <FaTriangleExclamation className="h-4 w-4 text-red-600" />
          </span>
        )}
        {row.original.externalId.startsWith("MAL-") && (
          <span title="Malicious Package (ossf/malicious-packages)">
            <FaVirus className="h-4 w-4 text-red-600" />
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "epssScore",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        EPSS <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-xs tabular-nums">
        {row.original.epssScore != null ? row.original.epssScore.toFixed(3) : "n/a"}
      </span>
    ),
  },
  {
    accessorKey: "packageName",
    header: "Package",
    cell: ({ row }) => {
      const members = row.original._groupMembers
      if (members && members.length > 1) {
        return (
          <GroupedPackageCell
            groupId={row.original.id}
            sourcePackage={row.original.sourcePackage ?? row.original.packageName}
            version={row.original.packageVersion}
            members={members}
          />
        )
      }
      return (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.original.packageName}</span>
            {row.original.packageExists === false && (
              <span title="This package is no longer in the asset's inventory. The alert stays open until a scan or manual review confirms the finding no longer applies.">
                <Badge
                  variant="outline"
                  className="text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800"
                >
                  Not in inventory
                </Badge>
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{row.original.packageVersion}</div>
        </div>
      )
    },
  },
  { accessorKey: "ecosystem", header: "Ecosystem" },
  {
    accessorKey: "sources",
    header: "Sources",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.sources.map(s => (
          <Badge key={s} variant="outline" className="text-xs">{s.toUpperCase()}</Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "externalId",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Vuln ID <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <span className="font-mono text-xs">{row.original.externalId}</span>
        {row.original.approximateMatch && (
          <span title="Approximate match — version could not be precisely compared">
            <CircleHelp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </span>
        )}
      </span>
    ),
  },
  {
    accessorKey: "summary",
    header: "Summary",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
        {row.original.summary ?? "n/a"}
      </span>
    ),
  },
  {
    id: "asset",
    header: "Asset",
    cell: ({ row }) => (
      <Link
        href={`/assets/${row.original.assetId}`}
        className="text-xs hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.asset.name || row.original.asset.hostname}
      </Link>
    ),
  },
  {
    id: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const tags = row.original.tags
      if (tags.length === 0) return null
      return (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          key={row.original.status}
          alertIds={row.original._groupMembers?.map(m => m.id) ?? [row.original.id]}
          currentStatus={row.original.status}
          onStatusChange={onStatusChange}
        />
      </div>
    ),
  },
  {
    // Whether a fixed version is known. Not sortable or filterable: the list sorts on the server
    // (SORT_COLUMNS), which has no such key.
    id: "fixedIn",
    header: "Fix available",
    cell: ({ row }) => <FixedInCell alert={row.original} />,
  },
  {
    accessorKey: "detectedAt",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Detected <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
        {new Date(row.original.detectedAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    accessorKey: "dueDate",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Due <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const status = getSlaStatus(row.original.dueDate ? new Date(row.original.dueDate) : null)
      const colorClass = status === "overdue" ? "text-red-600 font-medium" : status === "urgent" ? "text-orange-600 font-medium" : status === "warning" ? "text-yellow-600" : status === "unscored" ? "text-blue-600" : "text-muted-foreground"
      return (
        <span className={`text-xs ${colorClass}`} suppressHydrationWarning>
          {formatDaysUntilDue(row.original.dueDate ? new Date(row.original.dueDate) : null)}
        </span>
      )
    },
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Updated <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
        {new Date(row.original.updatedAt).toLocaleDateString()}
      </span>
    ),
  },
]}


export const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
]

export const CVSS_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

export const FIX_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "none", label: "None" },
]

export const KEV_OPTIONS = [
  { value: "kev", label: "KEV" },
  { value: "malware", label: "Malware" },
]

export const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "urgent", label: "Urgent" },
  { value: "warning", label: "Warning" },
  { value: "ok", label: "OK" },
  { value: "unscored", label: "Unscored" },
]

export function AlertsTable({ data: initialData, initialPackageName, initialAssetId, slaEnabled = true }: { data: Alert[]; initialPackageName?: string; initialAssetId?: string; slaEnabled?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  useEffect(() => { setData(initialData) }, [initialData])
  const [selected, setSelected] = useState<Alert | null>(null)
  const [open, setOpen] = useState(false)
  const [assetFilter, setAssetFilter] = useState<Set<string>>(new Set(initialAssetId ? [initialAssetId] : []))
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(["open", "in_progress"]))
  const [cvssFilter, setCvssFilter] = useState<Set<string>>(new Set())
  const [kevFilter, setKevFilter] = useState<Set<string>>(new Set())
  const [ecosystemFilter, setEcosystemFilter] = useState<Set<string>>(new Set())
  const [sourcesFilter, setSourcesFilter] = useState<Set<string>>(new Set())
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [dependencyFilter, setDependencyFilter] = useState<Set<string>>(new Set())
  const [inventoryFilter, setInventoryFilter] = useState<Set<string>>(new Set())
  const [dueFilter, setDueFilter] = useState<Set<string>>(new Set())
  const [distroFilter, setDistroFilter] = useState<Set<string>>(new Set())
  const [fixStatusFilter, setFixStatusFilter] = useState<Set<string>>(new Set())
  const [fixFilter, setFixFilter] = useState<Set<string>>(new Set())
  const [selectedAlerts, setSelectedAlerts] = useState<Alert[]>([])
  const [bulkStatus, setBulkStatus] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)

  const assetOptions = useMemo(() =>
    [...new Map(data.map(a => [a.assetId, a.asset])).values()]
      .sort((a, b) => (a.name || a.hostname).localeCompare(b.name || b.hostname))
      .map(asset => ({ value: asset.id, label: asset.name || asset.hostname })),
    [data]
  )

  const ecosystemOptions = useMemo(() =>
    [...new Set(data.map(a => a.ecosystem))]
      .filter(Boolean)
      .sort()
      .map(eco => ({ value: eco, label: eco })),
    [data]
  )

  // One option per distro-and-rating pair actually present, since each distro
  // rates on its own scale; empty (and the filter hidden) when none has one.
  const distroOptions = useMemo(() => {
    const labels = new Set<string>()
    for (const a of data) {
      const label = distroPriorityLabel(a.ecosystem, a.distroPriority)
      if (label) labels.add(label)
    }
    if (labels.size === 0) return []
    return [
      ...[...labels].sort().map(l => ({ value: l, label: l })),
      { value: NONE_OPTION, label: "None" },
    ]
  }, [data])

  // One option per fix status actually present, in the column's order;
  // empty (and the filter hidden) when no alert has one.
  const fixStatusOptions = useMemo(() => {
    const statuses = new Set<string>()
    for (const a of data) if (a.fixStatus) statuses.add(a.fixStatus)
    if (statuses.size === 0) return []
    return [
      ...[...statuses]
        .sort((x, y) => fixStatusSortKey(x)! - fixStatusSortKey(y)! || x.localeCompare(y))
        .map(s => ({ value: s, label: fixStatusLabel(s)! })),
      { value: NONE_OPTION, label: "None" },
    ]
  }, [data])

  const sourcesOptions = useMemo(() =>
    [...new Set(data.flatMap(a => a.sources))]
      .sort()
      .map(s => ({ value: s, label: s.toUpperCase() })),
    [data]
  )

  const tagOptions = useMemo(() => {
    const seen = new Map<string, { value: string; label: string }>()
    for (const alert of data) {
      for (const tag of alert.tags) {
        if (!seen.has(tag.id)) seen.set(tag.id, { value: tag.id, label: tag.name })
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [data])

  const filteredData = useMemo(() => {
    const filters = {
      asset: assetFilter, status: statusFilter, cvss: cvssFilter, kev: kevFilter, ecosystem: ecosystemFilter,
      sources: sourcesFilter, tag: tagFilter, dependency: dependencyFilter, inventory: inventoryFilter,
      due: dueFilter, distro: distroFilter, fixStatus: fixStatusFilter, fix: fixFilter,
    }
    return data.filter(alert => matchesListFilters(alert, filters))
  }, [data, assetFilter, statusFilter, cvssFilter, kevFilter, ecosystemFilter, sourcesFilter, tagFilter, dependencyFilter, inventoryFilter, dueFilter, distroFilter, fixStatusFilter, fixFilter])

  const groupedData = useMemo(() => groupBySourcePackage(filteredData), [filteredData])

  const hasFilter = assetFilter.size > 0 || statusFilter.size > 0 || cvssFilter.size > 0 || kevFilter.size > 0 || ecosystemFilter.size > 0 || sourcesFilter.size > 0 || tagFilter.size > 0 || dependencyFilter.size > 0 || inventoryFilter.size > 0 || dueFilter.size > 0 || distroFilter.size > 0 || fixStatusFilter.size > 0 || fixFilter.size > 0

  function handleStatusChange(alertId: string, newStatus: string) {
    setData(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus } : a))
    setSelected(prev => prev?.id === alertId ? { ...prev, status: newStatus } : prev)
  }

  const columns = useMemo(() => buildColumns(handleStatusChange), [])

  function handleOpenChange(v: boolean) {
    setOpen(v)
  }

  async function handleBulkStatusChange() {
    if (!bulkStatus || selectedAlerts.length === 0) return
    setBulkLoading(true)
    await Promise.all(
      selectedAlerts.map(alert =>
        fetch(`/api/alerts/${alert.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: bulkStatus }),
        })
      )
    )
    const ids = new Set(selectedAlerts.map(a => a.id))
    setData(prev => prev.map(a => ids.has(a.id) ? { ...a, status: bulkStatus } : a))
    setBulkStatus("")
    setBulkLoading(false)
    router.refresh()
  }

  const exportRef = useRef<(() => Alert[]) | undefined>(undefined)

  function download(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportCSV() {
    const rows = (exportRef.current?.() ?? filteredData).flatMap(a => a._groupMembers ?? [a])
    const lines = [alertCsvHeaderLine(), ...rows.map(alertCsvLine)]
    download(lines.join("\r\n"), exportFilename("csv"), "text/csv;charset=utf-8;")
  }

  function handleExportJSON() {
    const rows = (exportRef.current?.() ?? filteredData).flatMap(a => a._groupMembers ?? [a])
    const out = rows.map(alertJsonRecord)
    download(JSON.stringify(out, null, 2), exportFilename("json"), "application/json")
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="Asset"
          options={assetOptions}
          selected={assetFilter}
          onSelectedChange={setAssetFilter}
          searchable
        />
        <DataTableFacetedFilter
          title="Status"
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onSelectedChange={setStatusFilter}
        />
        <DataTableFacetedFilter
          title="Severity"
          options={CVSS_OPTIONS}
          selected={cvssFilter}
          onSelectedChange={setCvssFilter}
        />
        {distroOptions.length > 0 && (
          <DataTableFacetedFilter
            title="Distro Rating"
            options={distroOptions}
            selected={distroFilter}
            onSelectedChange={setDistroFilter}
            searchable
          />
        )}
        {fixStatusOptions.length > 0 && (
          <DataTableFacetedFilter
            title="Fix Status"
            options={fixStatusOptions}
            selected={fixStatusFilter}
            onSelectedChange={setFixStatusFilter}
          />
        )}
        <DataTableFacetedFilter
          title="Fix available"
          options={FIX_OPTIONS}
          selected={fixFilter}
          onSelectedChange={setFixFilter}
        />
        <DataTableFacetedFilter
          title="Risk"
          options={KEV_OPTIONS}
          selected={kevFilter}
          onSelectedChange={setKevFilter}
        />
        <DataTableFacetedFilter
          title="Ecosystem"
          options={ecosystemOptions}
          selected={ecosystemFilter}
          onSelectedChange={setEcosystemFilter}
          searchable
        />
        <DataTableFacetedFilter
          title="Sources"
          options={sourcesOptions}
          selected={sourcesFilter}
          onSelectedChange={setSourcesFilter}
        />
        <DataTableFacetedFilter
          title="Tags"
          options={tagOptions}
          selected={tagFilter}
          onSelectedChange={setTagFilter}
          searchable
        />
        <DataTableFacetedFilter
          title="Dependency"
          options={[
            { value: "direct", label: "Direct" },
            { value: "indirect", label: "Indirect" },
          ]}
          selected={dependencyFilter}
          onSelectedChange={setDependencyFilter}
        />
        <DataTableFacetedFilter
          title="Inventory"
          options={[
            { value: "missing", label: "Not in inventory" },
            { value: "present", label: "In inventory" },
          ]}
          selected={inventoryFilter}
          onSelectedChange={setInventoryFilter}
        />
        {slaEnabled && (
          <DataTableFacetedFilter
            title="Due"
            options={DUE_OPTIONS}
            selected={dueFilter}
            onSelectedChange={setDueFilter}
          />
        )}
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (initialAssetId) { router.push("/alerts"); return }
              setAssetFilter(new Set()); setStatusFilter(new Set()); setCvssFilter(new Set()); setKevFilter(new Set()); setEcosystemFilter(new Set()); setSourcesFilter(new Set()); setTagFilter(new Set()); setDependencyFilter(new Set()); setInventoryFilter(new Set()); setDueFilter(new Set()); setDistroFilter(new Set()); setFixStatusFilter(new Set()); setFixFilter(new Set())
            }}
          >
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>

      <GroupExpansionProvider>
      <DataTable
        columns={columns}
        data={groupedData}
        filterColumn="packageName"
        filterPlaceholder="Search by package name..."
        secondFilterColumn="externalId"
        secondFilterPlaceholder="Vuln ID..."
        initialPageSize={10}
        initialFilterValue={initialPackageName}
        onFilterReset={() => { router.push("/alerts") }}
        onRowClick={(row) => { setSelected(row); setOpen(true) }}
        enableRowSelection
        getRowId={(row) => row.id}
        onRowSelectionChange={(rows) => setSelectedAlerts(rows.flatMap(r => r._groupMembers ?? [r]))}
        initialSorting={[{ id: "detectedAt", desc: true }]}
        initialColumnVisibility={DEFAULT_COLUMN_VISIBILITY}
        exportRef={exportRef}
        headerActions={
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <div className="absolute right-0 top-full z-10 mt-1 hidden group-focus-within:flex group-hover:flex flex-col rounded-md border bg-popover shadow-md min-w-30">
                <button type="button" onClick={handleExportCSV} className="px-3 py-2 text-sm text-left hover:bg-accent rounded-t-md">CSV</button>
                <button type="button" onClick={handleExportJSON} className="px-3 py-2 text-sm text-left hover:bg-accent rounded-b-md">JSON</button>
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
      </GroupExpansionProvider>
      <AlertDetailSheet
        key={selected?.id}
        alert={selected}
        group={selected?._groupMembers && {
          sourcePackage: selected.sourcePackage ?? selected.packageName,
          members: selected._groupMembers.map(m => ({ id: m.id, packageName: m.packageName })),
        }}
        open={open}
        onOpenChange={handleOpenChange}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
