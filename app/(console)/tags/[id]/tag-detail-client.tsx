"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { AlertSummaryBadges, type AlertSummary } from "@/components/alerts/alert-summary-badges"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
  BreadcrumbLink, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { AddItemsPopover, type AddItemsSource } from "./add-items-popover"

type AssetItem = {
  id: string
  name: string
  hostname: string | null
  assetType: string
}

type AssetTagItem = {
  assetId: string
  asset: AssetItem
}

type PackageTagItem = {
  packageName: string
}

type TagDetail = {
  id: string
  name: string
  type: string
  color: string | null
  description: string | null
  assetTags: AssetTagItem[]
  packageTags: PackageTagItem[]
  alertSummary: AlertSummary
  kevCount: number
  assetAlertCounts: Record<string, number>
  packageAlertCounts: Record<string, number>
  packageEcosystems: Record<string, string>
}

// Every asset, filtered in the popover: an install has at most a few thousand.
const assetSource: AddItemsSource = {
  kind: "local",
  load: async () => {
    const res = await fetch("/api/assets")
    if (!res.ok) throw new Error(`assets: ${res.status}`)
    const data = await res.json()
    return (data.assets ?? data).map((a: AssetItem) => ({
      value: a.id,
      label: a.name,
      detail: a.hostname && a.hostname !== a.name ? a.hostname : undefined,
    }))
  },
}

// Package names run to tens of thousands across assets: searched per query.
const packageSource: AddItemsSource = {
  kind: "remote",
  search: async (query) => {
    const res = await fetch(`/api/packages?search=${encodeURIComponent(query)}&limit=100`)
    if (!res.ok) throw new Error(`packages: ${res.status}`)
    const data: { name: string; ecosystem: string }[] = await res.json()
    return data.map((p) => ({ value: p.name, label: p.name, detail: p.ecosystem || undefined }))
  },
}

async function postTagMembers(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
}

export function TagDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [tag, setTag] = useState<TagDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [removingAsset, setRemovingAsset] = useState<string | null>(null)
  const [removingPkg, setRemovingPkg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/tags/${id}`)
    if (res.ok) setTag(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function removeAsset(assetId: string) {
    setRemovingAsset(assetId)
    await fetch(`/api/tags/${id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", assetId }),
    })
    setRemovingAsset(null)
    load()
  }

  async function removePackage(packageName: string) {
    setRemovingPkg(packageName)
    await fetch(`/api/tags/${id}/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", packageName }),
    })
    setRemovingPkg(null)
    load()
  }

  if (loading) return <div className="text-muted-foreground p-4">Loading...</div>
  if (!tag) return <div className="text-destructive p-4">Tag not found</div>

  const existingAssetIds = new Set(tag.assetTags.map(at => at.assetId))
  const existingPkgNames = new Set(tag.packageTags.map(pt => pt.packageName))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/tags">Tags</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{tag.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
          {tag.color && <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
          <h1 className="text-2xl font-bold">{tag.name}</h1>
          <Badge variant="outline" className="capitalize">{tag.type}</Badge>
        </div>
        {tag.description && <p className="text-muted-foreground text-sm">{tag.description}</p>}
      </div>

      {/* Alert Summary */}
      <div className="rounded-lg border p-4 space-y-2 w-fit min-w-64">
        <h2 className="text-sm font-semibold">Open Alert Summary</h2>
        <AlertSummaryBadges summary={tag.alertSummary} kevCount={tag.kevCount} />
      </div>

      {/* Asset Tag Detail */}
      {tag.type === "asset" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Assets ({tag.assetTags.length})</h2>
          <AddItemsPopover
            title="Add assets"
            noun="assets"
            source={assetSource}
            excluded={existingAssetIds}
            onAdd={async (assetIds) => {
              await postTagMembers(`/api/tags/${tag.id}/assets`, { action: "add", assetIds })
              await load()
            }}
          />
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Hostname</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Open Alerts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tag.assetTags.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No assets tagged</td></tr>
                )}
                {tag.assetTags.map(at => (
                  <tr
                    key={at.assetId}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => router.push(`/assets/${at.assetId}`)}
                  >
                    <td className="px-4 py-3 font-medium">{at.asset.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{at.asset.hostname ?? ""}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize text-xs">{at.asset.assetType}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {tag.assetAlertCounts[at.assetId]
                        ? <span className="text-destructive font-medium">{tag.assetAlertCounts[at.assetId]}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={removingAsset === at.assetId}
                          onClick={() => removeAsset(at.assetId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Package Tag Detail */}
      {tag.type === "package" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Packages ({tag.packageTags.length})</h2>
          <AddItemsPopover
            title="Add packages"
            noun="packages"
            source={packageSource}
            excluded={existingPkgNames}
            onAdd={async (packageNames) => {
              await postTagMembers(`/api/tags/${tag.id}/packages`, { action: "add", packageNames })
              await load()
            }}
          />
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Package Name</th>
                  <th className="px-4 py-3 text-left font-medium">Ecosystem</th>
                  <th className="px-4 py-3 text-left font-medium">Open Alerts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tag.packageTags.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No packages tagged</td></tr>
                )}
                {tag.packageTags.map(pt => (
                  <tr key={pt.packageName} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{pt.packageName}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {tag.packageEcosystems[pt.packageName] || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {tag.packageAlertCounts[pt.packageName]
                        ? <span className="text-destructive font-medium">{tag.packageAlertCounts[pt.packageName]}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={removingPkg === pt.packageName}
                        onClick={() => removePackage(pt.packageName)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
