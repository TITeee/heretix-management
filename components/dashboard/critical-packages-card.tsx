"use client"

import Link from "next/link"
import { Package } from "lucide-react"
import { FaTriangleExclamation } from "react-icons/fa6"

type SeverityCounts = { critical: number; high: number; medium: number; low: number; unknown: number }

type PackageItem = {
  packageName: string
  packageVersion: string
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
          <div className={`flex items-center justify-center gap-1 text-[13px] mt-auto ${pkg.kevCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            <FaTriangleExclamation className="h-3.25 w-3.25 shrink-0" />
            <span>{pkg.kevCount} KEV</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
