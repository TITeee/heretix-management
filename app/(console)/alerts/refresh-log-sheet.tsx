"use client"

import { useEffect, useState } from "react"
import { FaBiohazard } from "react-icons/fa"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { SeverityBadge } from "@/components/alerts/vuln-detail-tabs"

type AlertEventRow = {
  id: string
  type: string
  data: Record<string, unknown> | null
  alert: {
    externalId: string
    packageName: string
    packageVersion: string
    asset: { name: string; hostname: string }
  }
}

type RefreshRun = {
  id: string
  executedAt: string
  updatedCount: number
  alertEvents: AlertEventRow[]
}

function EventChanges({ type, data }: { type: string; data: Record<string, unknown> | null }) {
  if (!data) return null

  if (type === "severity_changed") {
    const from = data.from as string | null
    const to = data.to as string | null
    return (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">severity:</span>
        <span className="font-mono">{from ?? "n/a"}</span>
        <span className="text-muted-foreground">▶</span>
        <span className="font-mono font-medium">{to ?? "n/a"}</span>
      </span>
    )
  }

  if (type === "cvss_changed") {
    const from = data.from as number | null
    const to = data.to as number | null
    return (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">CVSS:</span>
        <SeverityBadge score={from} />
        <span className="text-muted-foreground">▶</span>
        <SeverityBadge score={to} />
      </span>
    )
  }

  if (type === "kev_added") {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
        <FaBiohazard className="h-3 w-3" />
        Added to CISA KEV
      </span>
    )
  }

  if (type === "epss_changed") {
    const from = data.percentileFrom as number | null
    const to = data.percentileTo as number | null
    return (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">EPSS:</span>
        <span className="font-mono">{from != null ? `${(from * 100).toFixed(1)}%ile` : "n/a"}</span>
        <span className="text-muted-foreground">▶</span>
        <span className="font-mono font-medium">{to != null ? `${(to * 100).toFixed(1)}%ile` : "n/a"}</span>
      </span>
    )
  }

  return null
}

function RunRow({ run }: { run: RefreshRun }) {
  const [expanded, setExpanded] = useState(false)

  // Group events by alert
  const byAlert = new Map<string, { event: AlertEventRow; events: AlertEventRow[] }>()
  for (const ev of run.alertEvents) {
    const key = ev.alert.externalId + ev.alert.packageName + ev.alert.packageVersion
    if (!byAlert.has(key)) {
      byAlert.set(key, { event: ev, events: [] })
    }
    byAlert.get(key)!.events.push(ev)
  }
  const alertGroups = [...byAlert.values()]

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="text-sm font-medium" suppressHydrationWarning>
            {new Date(run.executedAt).toLocaleString()}
          </span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {run.updatedCount} updated
        </Badge>
      </button>

      {expanded && (
        <div className="border-t divide-y">
          {alertGroups.map(({ event, events }) => (
            <div key={event.id} className="px-4 py-2 text-sm">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {event.alert.externalId}
                </span>
                <span className="text-muted-foreground text-xs">
                  {event.alert.packageName} {event.alert.packageVersion}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({event.alert.asset.name || event.alert.asset.hostname})
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {events.map(ev => (
                  <EventChanges key={ev.id} type={ev.type} data={ev.data} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RefreshLogSheet({ open, onOpenChange }: Props) {
  const [runs, setRuns] = useState<RefreshRun[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/alerts/refresh-log?limit=50")
      .then(r => r.json())
      .then(d => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Refresh History</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {!loading && runs.length === 0 && (
            <p className="text-sm text-muted-foreground px-3">No refresh history yet.</p>
          )}
          {runs.map(run => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
