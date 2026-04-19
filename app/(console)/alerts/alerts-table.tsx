"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SeverityBadge } from "@/components/alerts/vuln-detail-tabs"
import { AlertDetailSheet, STATUS_ICON_MAP, StatusIcon } from "@/components/alerts/alert-detail-sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowUpDown, X } from "lucide-react"
import { FaTriangleExclamation, FaVirus } from "react-icons/fa6"
import Link from "next/link"
import { useRouter } from "next/navigation"

export type Alert = {
  id: string
  assetId: string
  packageName: string
  packageVersion: string
  ecosystem: string
  externalId: string
  sources: string[]
  cvssScore: number | null
  cvssVector: string | null
  severity: string | null
  summary: string | null
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
  status: string
  notes: string | null
  resolveReason: string | null
  detectedAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  asset: { id: string; name: string; hostname: string }
  tags: { id: string; name: string; color: string | null }[]
}

function StatusSelect({ alertId, currentStatus, onStatusChange }: {
  alertId: string
  currentStatus: string
  onStatusChange?: (id: string, status: string) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)

  async function onChange(value: string | null) {
    if (!value) return
    setStatus(value)
    onStatusChange?.(alertId, value)
    setLoading(true)
    await fetch(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <span className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="open"><span className="flex items-center gap-1.5"><StatusIcon status="open" />Open</span></SelectItem>
        <SelectItem value="in_progress"><span className="flex items-center gap-1.5"><StatusIcon status="in_progress" />In Progress</span></SelectItem>
        <SelectItem value="resolved"><span className="flex items-center gap-1.5"><StatusIcon status="resolved" />Resolved</span></SelectItem>
        <SelectItem value="ignored"><span className="flex items-center gap-1.5"><StatusIcon status="ignored" />Ignored</span></SelectItem>
      </SelectContent>
    </Select>
  )
}



function buildColumns(onStatusChange: (id: string, status: string) => void): ColumnDef<Alert>[] {
  return [
  {
    accessorKey: "cvssScore",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        CVSS <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <SeverityBadge score={row.original.cvssScore} />,
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
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.packageName}</div>
        <div className="text-xs text-muted-foreground">{row.original.packageVersion}</div>
      </div>
    ),
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
      <span className="font-mono text-xs">{row.original.externalId}</span>
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
            <Badge
              key={tag.id}
              variant="outline"
              className="text-xs font-medium"
              style={tag.color ? { color: tag.color, borderColor: tag.color } : undefined}
            >
              {tag.name}
            </Badge>
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
        <StatusSelect key={row.original.status} alertId={row.original.id} currentStatus={row.original.status} onStatusChange={onStatusChange} />
      </div>
    ),
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


const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
]

const CVSS_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const KEV_OPTIONS = [
  { value: "kev", label: "KEV" },
  { value: "malware", label: "Malware" },
]

export function AlertsTable({ data: initialData, initialPackageName, initialAssetId }: { data: Alert[]; initialPackageName?: string; initialAssetId?: string }) {
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

  const filteredData = useMemo(() => data.filter(alert => {
    if (assetFilter.size > 0 && !assetFilter.has(alert.assetId)) return false
    if (statusFilter.size > 0 && !statusFilter.has(alert.status)) return false
    if (cvssFilter.size > 0) {
      const score = alert.cvssScore ?? 0
      const tier = score >= 9.0 ? "critical" : score >= 7.0 ? "high" : score >= 4.0 ? "medium" : "low"
      if (!cvssFilter.has(tier)) return false
    }
    if (kevFilter.size > 0) {
      const matches =
        (kevFilter.has("kev") && alert.isKev) ||
        (kevFilter.has("malware") && alert.externalId.startsWith("MAL-"))
      if (!matches) return false
    }
    if (ecosystemFilter.size > 0 && !ecosystemFilter.has(alert.ecosystem)) return false
    if (sourcesFilter.size > 0 && !alert.sources.some(s => sourcesFilter.has(s))) return false
    if (tagFilter.size > 0 && !alert.tags.some(t => tagFilter.has(t.id))) return false
    return true
  }), [data, assetFilter, statusFilter, cvssFilter, kevFilter, ecosystemFilter, sourcesFilter, tagFilter])

  const hasFilter = assetFilter.size > 0 || statusFilter.size > 0 || cvssFilter.size > 0 || kevFilter.size > 0 || ecosystemFilter.size > 0 || sourcesFilter.size > 0 || tagFilter.size > 0

  function handleStatusChange(alertId: string, newStatus: string) {
    setData(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus } : a))
    setSelected(prev => prev?.id === alertId ? { ...prev, status: newStatus } : prev)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (initialAssetId) { window.location.href = "/alerts"; return }
              setAssetFilter(new Set()); setStatusFilter(new Set()); setCvssFilter(new Set()); setKevFilter(new Set()); setEcosystemFilter(new Set()); setSourcesFilter(new Set()); setTagFilter(new Set())
            }}
          >
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        filterColumn="packageName"
        filterPlaceholder="Search by package name..."
        secondFilterColumn="externalId"
        secondFilterPlaceholder="Vuln ID..."
        initialPageSize={25}
        initialFilterValue={initialPackageName}
        onFilterReset={() => { window.location.href = "/alerts" }}
        onRowClick={(row) => { setSelected(row); setOpen(true) }}
        enableRowSelection
        getRowId={(row) => row.id}
        onRowSelectionChange={setSelectedAlerts}
        initialSorting={[{ id: "detectedAt", desc: true }]}
        initialColumnVisibility={{ updatedAt: false, sources: false }}
        headerActions={
          selectedAlerts.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedAlerts.length} selected</span>
              <Select value={bulkStatus} onValueChange={(v) => { if (v) setBulkStatus(v) }}>
                <SelectTrigger className="h-8 w-44 text-sm">
                  <span className="flex items-center gap-1.5">
                    {bulkStatus && <StatusIcon status={bulkStatus} />}
                    <SelectValue placeholder="Change status..." />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open"><span className="flex items-center gap-1.5"><StatusIcon status="open" />Open</span></SelectItem>
                  <SelectItem value="in_progress"><span className="flex items-center gap-1.5"><StatusIcon status="in_progress" />In Progress</span></SelectItem>
                  <SelectItem value="resolved"><span className="flex items-center gap-1.5"><StatusIcon status="resolved" />Resolved</span></SelectItem>
                  <SelectItem value="ignored"><span className="flex items-center gap-1.5"><StatusIcon status="ignored" />Ignored</span></SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleBulkStatusChange} disabled={!bulkStatus || bulkLoading}>
                {bulkLoading ? "Applying..." : "Apply"}
              </Button>
            </div>
          ) : undefined
        }
      />
      <AlertDetailSheet
        key={selected?.id}
        alert={selected}
        open={open}
        onOpenChange={handleOpenChange}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
