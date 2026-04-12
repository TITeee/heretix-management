"use client"

import { useState } from "react"
import Link from "next/link"
import { SeverityBadge, StatusBadge } from "@/components/ui/severity-badge"
import { Badge } from "@/components/ui/badge"
import { AlertDetailSheet, type SheetAlert } from "@/components/alerts/alert-detail-sheet"
import { FaVirus } from "react-icons/fa6"

export function RecentAlertsClient({ alerts: initialAlerts }: { alerts: SheetAlert[] }) {
  const [alerts, setAlerts] = useState<SheetAlert[]>(initialAlerts)
  const [selected, setSelected] = useState<SheetAlert | null>(null)
  const [open, setOpen] = useState(false)

  function handleClick(alert: SheetAlert) {
    setSelected(alert)
    setOpen(true)
  }

  function handleStatusChange(alertId: string, status: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status } : a))
    )
    setSelected((prev) => (prev?.id === alertId ? { ...prev, status } : prev))
  }

  return (
    <>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts yet.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => handleClick(alert)}
              className="flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-col items-start gap-1 shrink-0">
                <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(alert.detectedAt).toLocaleString()}
                </span>
                <SeverityBadge score={alert.cvssScore} />
              </div>
              <div className="flex-1 space-y-0.5 min-w-0">
                <div className="font-medium">
                  {alert.packageName} {alert.packageVersion}
                  <Badge variant="secondary" className="ml-2 text-xs font-normal">{alert.ecosystem}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <Link
                    href={`/assets/${alert.assetId}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {alert.asset.name || alert.asset.hostname}
                  </Link>
                  <span className="flex items-center gap-1">
                    {alert.externalId.startsWith("MAL-") && (
                      <FaVirus className="h-3 w-3 text-red-600 shrink-0" title="Malicious Package" />
                    )}
                    {alert.externalId}
                  </span>
                </div>
              </div>
              <StatusBadge status={alert.status} />
            </div>
          ))}
          <div className="pt-1">
            <Link href="/alerts" className="text-xs text-muted-foreground hover:underline">
              View all alerts →
            </Link>
          </div>
        </div>
      )}
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
