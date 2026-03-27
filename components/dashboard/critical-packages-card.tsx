"use client"

import Link from "next/link"
import { Package } from "lucide-react"
import { SEVERITY_COLORS, getSeverityTier } from "@/lib/severity"

type PackageItem = {
  packageName: string
  packageVersion: string
  count: number
  maxCvss: number | null
}

export function CriticalPackagesCard({ packages }: { packages: PackageItem[] }) {
  if (packages.length === 0) {
    return <p className="text-sm text-muted-foreground">No packages found.</p>
  }

  return (
    <div className="flex flex-wrap gap-3">
      {packages.map((pkg) => {
        const tier = getSeverityTier(pkg.maxCvss)
        const bg = SEVERITY_COLORS[tier]
        const isLight = tier === "na"

        return (
          <Link
            key={`${pkg.packageName}@${pkg.packageVersion}`}
            href={`/alerts?packageName=${encodeURIComponent(pkg.packageName)}`}
            className="flex flex-col justify-between rounded-md p-3 shrink-0 w-36 h-36 hover:opacity-80 transition-opacity"
            style={{ backgroundColor: bg, color: isLight ? "#404040" : "#ffffff" }}
          >
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <Package className="h-7 w-7 opacity-80" />
              </div>
              <div className="text-sm font-semibold truncate">{pkg.packageName}</div>
              <div className="text-xs opacity-70">{pkg.packageVersion}</div>
            </div>
            <div className="text-4xl font-bold text-center">{pkg.count}</div>
          </Link>
        )
      })}
    </div>
  )
}
