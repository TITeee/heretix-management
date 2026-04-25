"use client"

import Link from "next/link"
import { FaDocker, FaServer } from "react-icons/fa"
import { FaTriangleExclamation } from "react-icons/fa6"
import { SEVERITY_COLORS, getSeverityTier } from "@/lib/severity"

type SeverityCounts = { critical: number; high: number; medium: number; low: number }

type AssetItem = {
  id: string
  name: string
  hostname: string
  assetType: string
  maxCvss: number | null
  severityAll: SeverityCounts
  severity24h: SeverityCounts
  kevCount: number
}

const PILL_COLORS = {
  critical: "#4c0519",
  high:     "#9f1239",
  medium:   "#e11d48",
  low:      "#fb7185",
} as const

const PILL_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low" } as const

function SeverityRow({ label, counts, textColor }: { label: string; counts: SeverityCounts; textColor: string }) {
  const tiers = ["critical", "high", "medium", "low"] as const
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-center" style={{ color: textColor, opacity: 0.6 }}>{label}</div>
      <div className="grid grid-cols-4 gap-0.5">
        {tiers.map((t) => (
          <div key={t} className="rounded flex flex-col items-center py-0.5"
            style={{ backgroundColor: PILL_COLORS[t], opacity: counts[t] === 0 ? 0.25 : 1 }}>
            <span className="text-[9px] text-white font-medium leading-none">{PILL_LABELS[t]}</span>
            <span className="text-xs text-white font-bold leading-none mt-0.5">{counts[t]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProductionAssetsCard({ assets }: { assets: AssetItem[] }) {
  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">No assets found.</p>
  }

  return (
    <div className="flex flex-wrap gap-3">
      {assets.map((asset) => {
        const tier = getSeverityTier(asset.maxCvss)
        const bg = SEVERITY_COLORS[tier]
        const isLight = tier === "na"
        const textColor = isLight ? "#404040" : "#ffffff"
        const label = asset.name || asset.hostname

        return (
          <Link
            key={asset.id}
            href={`/alerts?assetId=${asset.id}`}
            className="flex flex-col gap-2 rounded-md p-3 shrink-0 w-44 hover:opacity-80 transition-opacity"
            style={{ backgroundColor: bg, color: textColor }}
          >
            <div className="text-center">
              <div className="flex justify-center mb-1">
                {asset.assetType === "docker_image"
                  ? <FaDocker className="h-7 w-7 opacity-80" />
                  : <FaServer className="h-5 w-5 opacity-80" />
                }
              </div>
              <div className="text-sm font-semibold truncate">{label}</div>
            </div>
            <div className="space-y-0.5">
              <SeverityRow label="24h" counts={asset.severity24h} textColor={textColor} />
              <SeverityRow label="All" counts={asset.severityAll} textColor={textColor} />
            </div>
            <div className="flex items-center justify-center gap-1 text-xs" style={{ opacity: 0.85 }}>
              <FaTriangleExclamation className="h-3 w-3 shrink-0" />
              <span>{asset.kevCount} KEV</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
