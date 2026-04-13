"use client"

import React, { useEffect, useState } from "react"
import { VulnDetail, DetailSkeleton, NvdTab, OsvTab, AdvisoryTab, SeverityBadge } from "@/components/alerts/vuln-detail-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
import { Clock, TrendingUp, TrendingDown, AlertTriangle, History } from "lucide-react"
import { FaTriangleExclamation, FaVirus, FaCircleExclamation, FaClock, FaCircleMinus, FaCircleCheck } from "react-icons/fa6"
import Link from "next/link"
import { useRouter } from "next/navigation"

// Minimum Alert fields required by the detail sheet
export type SheetAlert = {
  id: string
  assetId: string
  packageName: string
  packageVersion: string
  ecosystem: string
  externalId: string
  sources: string[]
  cvssScore: number | null
  cvssVector: string | null
  summary: string | null
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
  status: string
  notes: string | null
  resolveReason: string | null
  detectedAt: Date
  resolvedAt: Date | null
  asset: { id: string; name: string; hostname: string }
}

export const STATUS_ICON_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  open:        { icon: FaCircleExclamation, className: "h-3.5 w-3.5 text-red-500" },
  in_progress: { icon: FaClock,            className: "h-3.5 w-3.5 text-blue-500" },
  resolved:    { icon: FaCircleCheck,      className: "h-3.5 w-3.5 text-green-600" },
  ignored:     { icon: FaCircleMinus,      className: "h-3.5 w-3.5 text-muted-foreground" },
}

export function StatusIcon({ status }: { status: string }) {
  const entry = STATUS_ICON_MAP[status]
  if (!entry) return null
  const Icon = entry.icon
  return <Icon className={entry.className} />
}

type AlertEvent = {
  id: string
  alertId: string
  type: string
  data: Record<string, unknown> | null
  createdAt: string
}

const EVENT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; iconClass: string; label: (data: Record<string, unknown>) => string; getIcon?: (data: Record<string, unknown>) => { icon: React.ComponentType<{ className?: string }>; iconClass: string } }> = {
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
    getIcon: (data) => {
      const entry = STATUS_ICON_MAP[data.to as string]
      return entry ? { icon: entry.icon, iconClass: entry.className.replace(/h-\S+ w-\S+ /, "") } : { icon: FaCircleExclamation, iconClass: "text-blue-500" }
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
        const resolved = config.getIcon ? config.getIcon(event.data ?? {}) : { icon: config.icon, iconClass: config.iconClass }
        const Icon = resolved.icon
        const isLast = index === events.length - 1
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="rounded-full border-2 border-border bg-background p-1 shrink-0">
                <Icon className={`h-3.5 w-3.5 ${resolved.iconClass}`} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className={`pt-0.5 ${isLast ? "" : "pb-6"}`}>
              <p className="text-sm font-medium">{config.label(event.data ?? {})}</p>
              <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
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

export function AlertDetailSheet({
  alert,
  open,
  onOpenChange,
  onStatusChange: notifyStatusChange,
}: {
  alert: SheetAlert | null
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
  const [fetchError, setFetchError] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  useEffect(() => {
    if (alert) {
      setStatus(alert.status)
      setNotes(alert.notes ?? "")
    }
  }, [alert?.id])

  useEffect(() => {
    if (alert) {
      setStatus(alert.status)
    }
  }, [alert?.status])

  useEffect(() => {
    if (!open || !alert) return
    setVulnDetail(null)
    setFetchError(false)
    setLoadingDetail(true)
    fetch(`/api/search?id=${encodeURIComponent(alert.externalId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then((data) => setVulnDetail(data.results?.[0] ?? null))
      .catch(() => setFetchError(true))
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
          <SheetDescription className="flex items-center gap-2">
            {alert.packageName} {alert.packageVersion}
            <Badge variant="secondary" className="text-xs font-normal">{alert.ecosystem}</Badge>
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
                      <FaTriangleExclamation className="h-3.5 w-3.5" /> Known Exploited (CISA KEV)
                    </span>
                  </div>
                )}
                {alert.externalId.startsWith("MAL-") && (
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">Malware</span>
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <FaVirus className="h-3.5 w-3.5" /> Malicious Package (ossf/malicious-packages)
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
                  <span suppressHydrationWarning>{new Date(alert.detectedAt).toLocaleDateString()}</span>
                </div>
                {alert.resolvedAt && (
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-muted-foreground shrink-0">Resolved</span>
                    <span suppressHydrationWarning>{new Date(alert.resolvedAt).toLocaleDateString()}</span>
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
            <NvdTab detail={vulnDetail} loading={loadingDetail} error={fetchError} />
          </TabsContent>

          <TabsContent value="osv" className="flex-1 overflow-y-auto px-6 py-4">
            <OsvTab detail={vulnDetail} loading={loadingDetail} error={fetchError} />
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
