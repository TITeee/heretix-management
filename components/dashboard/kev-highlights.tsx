"use client"

import { useState } from "react"
import { FaTriangleExclamation } from "react-icons/fa6"
import Link from "next/link"
import { SeverityBadge, StatusBadge } from "@/components/ui/severity-badge"
import { AlertDetailSheet, type SheetAlert } from "@/components/alerts/alert-detail-sheet"

/** `alerts` are the newest open KEV alerts; `total` counts all of them, for the link to the rest. */
export function KevHighlights({ alerts: initialAlerts, total }: { alerts: SheetAlert[]; total: number }) {
  const [alerts, setAlerts] = useState<SheetAlert[]>(initialAlerts)
  const [selected, setSelected] = useState<SheetAlert | null>(null)
  const [open, setOpen] = useState(false)

  function handleClick(alert: SheetAlert) {
    setSelected(alert)
    setOpen(true)
  }

  function handleStatusChange(alertId: string, status: string) {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status } : a)))
    setSelected((prev) => (prev?.id === alertId ? { ...prev, status } : prev))
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">No KEV alerts found.</p>
  }

  return (
    <>
      <div className="space-y-2">
        {alerts.map((alert) => {
          const assetLabel = alert.asset.name || alert.asset.hostname
          return (
            <div
              key={alert.id}
              onClick={() => handleClick(alert)}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="font-medium flex flex-wrap items-center gap-1.5">
                  <FaTriangleExclamation className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <SeverityBadge score={alert.cvssScore} severity={alert.severity} />
                  <span className="font-mono text-xs">{alert.externalId}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{alert.packageName}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <Link
                    href={`/assets/${alert.assetId}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {assetLabel}
                  </Link>
                  <span suppressHydrationWarning className="ml-2">
                    Detected: {new Date(alert.detectedAt).toLocaleDateString()}
                  </span>
                  {alert.epssScore != null && (
                    <span className="ml-2">EPSS: {alert.epssScore.toFixed(3)}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0"><StatusBadge status={alert.status} /></div>
            </div>
          )
        })}
        {total > alerts.length && (
          <div className="pt-1">
            <Link href="/alerts?kev=1" className="text-xs text-muted-foreground hover:underline">
              View all KEV alerts ({total}) →
            </Link>
          </div>
        )}
      </div>
      <AlertDetailSheet
        key={selected?.id}
        alert={selected}
        open={open}
        onOpenChange={setOpen}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
