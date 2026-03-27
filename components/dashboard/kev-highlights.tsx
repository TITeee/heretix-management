import { ShieldAlert } from "lucide-react"
import Link from "next/link"
import { SeverityBadge } from "@/components/ui/severity-badge"

export type KevAlert = {
  id: string
  externalId: string
  packageName: string
  cvssScore: number | null
  epssScore: number | null
  isKev: boolean
  assetId: string
  asset: { name: string; hostname: string }
}

export function KevHighlights({ alerts }: { alerts: KevAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No KEV alerts found.</p>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const assetLabel = alert.asset.name || alert.asset.hostname
        return (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div className="space-y-0.5">
              <div className="font-medium flex items-center gap-1.5">
                {alert.isKev && (
                  <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
                )}
                <span className="font-mono text-xs">{alert.externalId}</span>
                <span className="text-muted-foreground">·</span>
                <span>{alert.packageName}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <Link href={`/assets/${alert.assetId}`} className="hover:underline">
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
  )
}
