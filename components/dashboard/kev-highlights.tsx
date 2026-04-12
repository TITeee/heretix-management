"use client"

import { useState } from "react"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"
import { SeverityBadge } from "@/components/ui/severity-badge"
import { AlertDetailSheet, type SheetAlert } from "@/components/alerts/alert-detail-sheet"

export function KevHighlights({ alerts: initialAlerts }: { alerts: SheetAlert[] }) {
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
              className="flex items-center justify-between rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-0.5">
                <div className="font-medium flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
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
                  {alert.epssScore != null && (
                    <span className="ml-2">EPSS: {alert.epssScore.toFixed(3)}</span>
                  )}
                </div>
              </div>
              <div><SeverityBadge score={alert.cvssScore} /></div>
            </div>
          )
        })}
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
