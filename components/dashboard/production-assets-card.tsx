"use client"

import Link from "next/link"
import { FaDocker, FaServer } from "react-icons/fa"
import { SEVERITY_COLORS, getSeverityTier } from "@/lib/severity"

type AssetItem = {
  id: string
  name: string
  hostname: string
  assetType: string
  count: number
  maxCvss: number | null
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
        const label = asset.name || asset.hostname

        return (
          <Link
            key={asset.id}
            href={`/alerts?assetId=${asset.id}`}
            className="flex flex-col justify-between rounded-md p-3 shrink-0 w-36 h-36 hover:opacity-80 transition-opacity"
            style={{ backgroundColor: bg, color: isLight ? "#404040" : "#ffffff" }}
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
            <div className="text-4xl font-bold text-center">{asset.count}</div>
          </Link>
        )
      })}
    </div>
  )
}
