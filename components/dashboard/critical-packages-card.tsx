"use client"

import Link from "next/link"
import { Package, Server } from "lucide-react"
import { FaTriangleExclamation } from "react-icons/fa6"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type SeverityCounts = { critical: number; high: number; medium: number; low: number; unknown: number }

type PackageItem = {
  packageName: string
  packageVersion: string
  maxCvss: number | null
  severityAll: SeverityCounts
  severity24h: SeverityCounts
  kevCount: number
  // The assets this name and version is installed on, in name order.
  assets: { id: string; name: string }[]
}

// Asset names listed in the tooltip; the rest are counted.
const SHOWN_ASSETS = 10

function AssetsChip({ assets }: { assets: { id: string; name: string }[] }) {
  if (assets.length === 0) return null
  const shown = assets.slice(0, SHOWN_ASSETS)
  const rest = assets.length - shown.length
  // The card is a link, so the names are plain text and the chip is a span, not a button.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <Server className="h-3.25 w-3.25 shrink-0" />
              {assets.length} {assets.length === 1 ? "asset" : "assets"}
            </span>
          }
        />
        <TooltipContent side="top" className="flex flex-col items-start gap-0.5 text-left">
          <p className="text-[11px] opacity-70">Installed on</p>
          {shown.map((a) => <p key={a.id}>{a.name}</p>)}
          {rest > 0 && <p className="opacity-70">+{rest} more</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const PILL_COLORS = {
  critical: "#4c0519",
  high:     "#9f1239",
  medium:   "#e11d48",
  low:      "#fb7185",
  unknown:  "#6b7280",
} as const

const PILL_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low", unknown: "N/A" } as const

function SeverityRow({ label, counts }: { label: string; counts: SeverityCounts }) {
  const tiers = ["critical", "high", "medium", "low", "unknown"] as const
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-center">{label}</div>
      <div className="grid grid-cols-5 gap-0.5">
        {tiers.map((t) => (
          <div key={t} className="rounded flex flex-col items-center py-0.5"
            style={counts[t] === 0
              ? { border: "1px solid #9ca3af" }
              : { backgroundColor: PILL_COLORS[t] }
            }>
            <span className="text-[10px] font-medium leading-none" style={{ color: counts[t] === 0 ? "#9ca3af" : "white" }}>{PILL_LABELS[t]}</span>
            <span className="text-[13px] font-bold leading-none mt-0.5" style={{ color: counts[t] === 0 ? "#9ca3af" : "white" }}>{counts[t]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CriticalPackagesCard({ packages }: { packages: PackageItem[] }) {
  if (packages.length === 0) {
    return <p className="text-sm text-muted-foreground">No packages found.</p>
  }

  return (
    <div className="flex flex-wrap gap-3">
      {packages.map((pkg) => (
        <Link
          key={`${pkg.packageName}@${pkg.packageVersion}`}
          href={`/alerts?packageName=${encodeURIComponent(pkg.packageName)}`}
          className="flex flex-col gap-1.5 rounded-md border-2 border-border bg-card p-3.25 shrink-0 w-66 h-66 hover:bg-accent transition-colors"
        >
          <div className="text-center">
            <div className="flex justify-center mb-1.25">
              <Package className="h-7.75 w-7.75" />
            </div>
            <div className="text-[15px] font-semibold truncate mb-2.25">{pkg.packageName}</div>
            <div className="text-[13px] mb-2.25">{pkg.packageVersion}</div>
          </div>
          <div className="space-y-2">
            <SeverityRow label="24h" counts={pkg.severity24h} />
            <SeverityRow label="All" counts={pkg.severityAll} />
          </div>
          <div className="flex items-center justify-center gap-4 mt-auto">
            <div className={`flex items-center gap-1 text-[13px] ${pkg.kevCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              <FaTriangleExclamation className="h-3.25 w-3.25 shrink-0" />
              <span>{pkg.kevCount} KEV</span>
            </div>
            <AssetsChip assets={pkg.assets} />
          </div>
        </Link>
      ))}
    </div>
  )
}
