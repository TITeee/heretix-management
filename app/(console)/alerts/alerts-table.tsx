"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { VulnDetail, DetailSkeleton, NvdTab, OsvTab, AdvisoryTab, SeverityBadge } from "@/components/alerts/vuln-detail-tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowUpDown, X, Clock, TrendingUp, TrendingDown, AlertTriangle, History } from "lucide-react"
import { FaBiohazard, FaCircleExclamation, FaClock, FaCircleMinus, FaCircleCheck } from "react-icons/fa6"
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


type AlertEvent = {
  id: string
  alertId: string
  type: string
  data: Record<string, unknown> | null
  createdAt: string
}

const EVENT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; iconClass: string; label: (data: Record<string, unknown>) => string }> = {
  detected: {
    icon: FaCircleExclamation,
    iconClass: "text-red-500",
    label: () => "Alert detected",
  },
  status_changed: {
    icon: FaCircleExclamation,
    iconClass: "text-blue-500",
    label: (data) => {
      const STATUS_LABELS: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", ignored: "Ignored" }
      return `Status changed to "${STATUS_LABELS[data.to as string] ?? data.to}"`
    },
  },
  kev_added: {
    icon: AlertTriangle,
    iconClass: "text-red-600",
    label: () => "Added to CISA KEV",
  },
  cvss_changed: {
    icon: TrendingUp,
    iconClass: "text-orange-500",
    label: (data) => `CVSS score changed: ${data.from ?? "n/a"} → ${data.to ?? "n/a"}`,
  },
  epss_changed: {
    icon: TrendingUp,
    iconClass: "text-blue-500",
    label: (data) => {
      const from = data.percentileFrom != null ? `${((data.percentileFrom as number) * 100).toFixed(1)}%ile` : (data.from ?? "n/a")
      const to = data.percentileTo != null ? `${((data.percentileTo as number) * 100).toFixed(1)}%ile` : (data.to ?? "n/a")
      return `EPSS updated: ${from} → ${to}`
    },
  },
  severity_changed: {
    icon: TrendingDown,
    iconClass: "text-yellow-600",
    label: (data) => `Severity changed: ${data.from ?? "n/a"} → ${data.to ?? "n/a"}`,
  },
  notes_saved: {
    icon: Clock,
    iconClass: "text-muted-foreground",
    label: () => "Notes saved",
  },
}

function AlertTimelineTab({ alertId, open, refreshKey }: { alertId: string; open: boolean; refreshKey: number }) {
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/alerts/${alertId}/events`)
      .then((r) => r.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, alertId, refreshKey])

  if (loading) return <DetailSkeleton />

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <History className="h-6 w-6" />
        <p className="text-sm">No history yet</p>
      </div>
    )
  }

  return (
    <div>
      {events.map((event, index) => {
        const config = EVENT_CONFIG[event.type]
        if (!config) return null
        const Icon = config.icon
        const isLast = index === events.length - 1
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="rounded-full border-2 border-border bg-background p-1 shrink-0">
                <Icon className={`h-3.5 w-3.5 ${config.iconClass}`} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className={`pt-0.5 ${isLast ? "" : "pb-6"}`}>
              <p className="text-sm font-medium">{config.label(event.data ?? {})}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(event.createdAt).toLocaleString()}
              </p>
              {event.type === "detected" && !!event.data?.severity && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {String(event.data?.severity)}{event.data?.cvssScore != null ? ` · CVSS ${String(event.data?.cvssScore)}` : ""}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AlertDetailSheet({
  alert,
  open,
  onOpenChange,
  onStatusChange: notifyStatusChange,
}: {
  alert: Alert | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onStatusChange: (alertId: string, status: string) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState(alert?.status ?? "open")
  const [notes, setNotes] = useState(alert?.notes ?? "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [vulnDetail, setVulnDetail] = useState<VulnDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  useEffect(() => {
    if (alert) {
      setStatus(alert.status)
      setNotes(alert.notes ?? "")
    }
  }, [alert?.id])

  useEffect(() => {
    if (!open || !alert) return
    setVulnDetail(null)
    setLoadingDetail(true)
    fetch(`/api/search?id=${encodeURIComponent(alert.externalId)}`)
      .then((r) => r.json())
      .then((data) => setVulnDetail(data.results?.[0] ?? null))
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [open, alert?.id])

  async function onStatusChange(value: string | null) {
    if (!alert || !value) return
    setStatus(value)
    notifyStatusChange(alert.id, value)
    setSavingStatus(true)
    await fetch(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    })
    setSavingStatus(false)
    setTimelineKey((k) => k + 1)
  }

  async function onSaveNotes() {
    if (!alert) return
    setSavingNotes(true)
    await fetch(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    })
    setSavingNotes(false)
    setTimelineKey((k) => k + 1)
    router.refresh()
  }

  if (!alert) return null

  const assetLabel = alert.asset.name || alert.asset.hostname

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[80vw] sm:max-w-4xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="font-mono text-sm">{alert.externalId}</SheetTitle>
          <SheetDescription>
            {alert.packageName} {alert.packageVersion} · {alert.ecosystem}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-6 mt-3 mb-0 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="nvd">NVD</TabsTrigger>
            <TabsTrigger value="osv">OSV</TabsTrigger>
            {(vulnDetail?.advisoryVulnerabilities?.length ?? 0) > 0 && (
              <TabsTrigger value="advisory">Advisory</TabsTrigger>
            )}
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Vulnerability */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vulnerability</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">CVSS</span>
                  <div className="flex items-center gap-2">
                    <SeverityBadge score={alert.cvssScore} />
                    {alert.cvssVector && (
                      <span className="font-mono text-xs text-muted-foreground break-all">{alert.cvssVector}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">EPSS</span>
                  <span className="tabular-nums">
                    {alert.epssScore != null ? alert.epssScore.toFixed(3) : "n/a"}
                    {alert.epssPercentile != null && (
                      <span className="text-muted-foreground ml-1">({(alert.epssPercentile * 100).toFixed(1)}%ile)</span>
                    )}
                  </span>
                </div>
                {alert.isKev && (
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">KEV</span>
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <FaBiohazard className="h-3.5 w-3.5" /> Known Exploited (CISA KEV)
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Sources</span>
                  <div className="flex flex-wrap gap-1">
                    {alert.sources.map(s => (
                      <Badge key={s} variant="outline" className="capitalize">{s.toUpperCase()}</Badge>
                    ))}
                  </div>
                </div>
                {alert.summary && (
                  <div className="flex gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">Summary</span>
                    <span className="text-xs leading-relaxed">{alert.summary}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Affected Package */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Affected Package</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Package</span>
                  <span className="font-medium">{alert.packageName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Version</span>
                  <span className="font-mono text-xs">{alert.packageVersion}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Ecosystem</span>
                  <span>{alert.ecosystem}</span>
                </div>
              </div>
            </section>

            {/* Asset */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Asset</span>
                  <Link href={`/assets/${alert.assetId}`} className="hover:underline text-primary">
                    {assetLabel}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Detected</span>
                  <span>{new Date(alert.detectedAt).toLocaleDateString()}</span>
                </div>
                {alert.resolvedAt && (
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">Resolved</span>
                    <span>{new Date(alert.resolvedAt).toLocaleDateString()}</span>
                  </div>
                )}
                {alert.resolveReason && (
                  <div className="flex items-start gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">Resolve Reason</span>
                    <span className="text-sm">{alert.resolveReason}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Management */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Management</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-sm text-muted-foreground shrink-0">Status</span>
                  <Select value={status} onValueChange={onStatusChange} disabled={savingStatus}>
                    <SelectTrigger className="h-8 w-40 text-sm">
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
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm text-muted-foreground">Notes</span>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes..."
                    className="text-sm min-h-24 resize-none"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={onSaveNotes} disabled={savingNotes}>
                      {savingNotes ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="nvd" className="flex-1 overflow-y-auto px-6 py-4">
            <NvdTab detail={vulnDetail} loading={loadingDetail} />
          </TabsContent>

          <TabsContent value="osv" className="flex-1 overflow-y-auto px-6 py-4">
            <OsvTab detail={vulnDetail} loading={loadingDetail} />
          </TabsContent>

          <TabsContent value="advisory" className="flex-1 overflow-y-auto px-6 py-4">
            <AdvisoryTab detail={vulnDetail} loading={loadingDetail} />
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 overflow-y-auto px-6 py-4">
            <AlertTimelineTab alertId={alert.id} open={open} refreshKey={timelineKey} />
          </TabsContent>
        </Tabs>

      </SheetContent>
    </Sheet>
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
        KEV <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) =>
      row.original.isKev ? (
        <span title="CISA Known Exploited Vulnerability">
          <FaBiohazard className="h-4 w-4 text-red-600" />
        </span>
      ) : null,
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
      <span className="text-xs text-muted-foreground">
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
      <span className="text-xs text-muted-foreground">
        {new Date(row.original.updatedAt).toLocaleDateString()}
      </span>
    ),
  },
]}

const STATUS_ICON_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  open:        { icon: FaCircleExclamation, className: "h-3.5 w-3.5 text-red-500" },
  in_progress: { icon: FaClock,            className: "h-3.5 w-3.5 text-blue-500" },
  resolved:    { icon: FaCircleCheck,      className: "h-3.5 w-3.5 text-green-600" },
  ignored:     { icon: FaCircleMinus,      className: "h-3.5 w-3.5 text-muted-foreground" },
}

function StatusIcon({ status }: { status: string }) {
  const entry = STATUS_ICON_MAP[status]
  if (!entry) return null
  const Icon = entry.icon
  return <Icon className={entry.className} />
}

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
]

export function AlertsTable({ data: initialData, initialPackageName }: { data: Alert[]; initialPackageName?: string }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  useEffect(() => { setData(initialData) }, [initialData])
  const [selected, setSelected] = useState<Alert | null>(null)
  const [open, setOpen] = useState(false)
  const [assetFilter, setAssetFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [cvssFilter, setCvssFilter] = useState<Set<string>>(new Set())
  const [kevFilter, setKevFilter] = useState<Set<string>>(new Set())
  const [ecosystemFilter, setEcosystemFilter] = useState<Set<string>>(new Set())
  const [sourcesFilter, setSourcesFilter] = useState<Set<string>>(new Set())
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

  const filteredData = useMemo(() => data.filter(alert => {
    if (assetFilter.size > 0 && !assetFilter.has(alert.assetId)) return false
    if (statusFilter.size > 0 && !statusFilter.has(alert.status)) return false
    if (cvssFilter.size > 0) {
      const score = alert.cvssScore ?? 0
      const tier = score >= 9.0 ? "critical" : score >= 7.0 ? "high" : score >= 4.0 ? "medium" : "low"
      if (!cvssFilter.has(tier)) return false
    }
    if (kevFilter.size > 0 && !kevFilter.has(alert.isKev ? "kev" : "non_kev")) return false
    if (ecosystemFilter.size > 0 && !ecosystemFilter.has(alert.ecosystem)) return false
    if (sourcesFilter.size > 0 && !alert.sources.some(s => sourcesFilter.has(s))) return false
    return true
  }), [data, assetFilter, statusFilter, cvssFilter, kevFilter, ecosystemFilter, sourcesFilter])

  const hasFilter = assetFilter.size > 0 || statusFilter.size > 0 || cvssFilter.size > 0 || kevFilter.size > 0 || ecosystemFilter.size > 0 || sourcesFilter.size > 0

  function handleStatusChange(alertId: string, newStatus: string) {
    setData(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus } : a))
    setSelected(prev => prev?.id === alertId ? { ...prev, status: newStatus } : prev)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => buildColumns(handleStatusChange), [])

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) router.refresh()
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
          title="KEV"
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
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setAssetFilter(new Set()); setStatusFilter(new Set()); setCvssFilter(new Set()); setKevFilter(new Set()); setEcosystemFilter(new Set()); setSourcesFilter(new Set()) }}
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
        initialPageSize={10}
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
