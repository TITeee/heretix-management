"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { SEVERITY_COLORS } from "@/lib/severity"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
  BreadcrumbLink, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Search } from "lucide-react"

type AlertSummary = Record<string, number>

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
  assetAlertCounts: Record<string, number>
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]

function severityColor(s: string): string {
  return SEVERITY_COLORS[(s.toLowerCase() as keyof typeof SEVERITY_COLORS)] ?? SEVERITY_COLORS.na
}

function AlertSummaryBadges({ summary }: { summary: AlertSummary }) {
  const entries = SEVERITY_ORDER.filter(s => summary[s] > 0)
  if (entries.length === 0) return <span className="text-sm text-muted-foreground">No open alerts</span>
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {entries.map(s => (
        <span
          key={s}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
          style={{ backgroundColor: severityColor(s), color: s === "UNKNOWN" ? "#374151" : "#fff" }}
        >
          {s}: {summary[s]}
        </span>
      ))}
    </div>
  )
}

function AssetSearchAdd({ tagId, existingIds, onAdded }: {
  tagId: string
  existingIds: Set<string>
  onAdded: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AssetItem[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/assets?search=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setResults((data.assets ?? data).filter((a: AssetItem) => !existingIds.has(a.id)))
      }
    } finally {
      setSearching(false)
    }
  }

  async function addAsset(assetId: string) {
    setAdding(assetId)
    try {
      await fetch(`/api/tags/${tagId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", assetId }),
      })
      onAdded()
      setResults([])
      setQuery("")
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="space-y-2 w-1/3 min-w-64">
      <div className="flex gap-2">
        <Input
          placeholder="Search assets by name or hostname..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
          className="flex-1"
        />
        <Button size="sm" onClick={doSearch} disabled={searching}>
          <Search className="h-4 w-4 mr-1" />
          Search
        </Button>
      </div>
      {results.length > 0 && (
        <div className="rounded-md border divide-y">
          {results.map(a => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{a.name}</span>
                {a.hostname && <span className="text-muted-foreground ml-2 text-xs">{a.hostname}</span>}
              </div>
              <Button size="sm" disabled={adding === a.id} onClick={() => addAsset(a.id)}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PackageAdd({ tagId, existingNames, onAdded }: {
  tagId: string
  existingNames: Set<string>
  onAdded: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ name: string; ecosystem: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/packages?search=${encodeURIComponent(query)}&limit=100`)
      if (res.ok) {
        const data: { name: string; ecosystem: string }[] = await res.json()
        setResults(data.filter(p => !existingNames.has(p.name)))
      }
    } finally {
      setSearching(false)
    }
  }

  async function addPackage(packageName: string) {
    setAdding(packageName)
    try {
      await fetch(`/api/tags/${tagId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", packageName }),
      })
      onAdded()
      setResults([])
      setQuery("")
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="space-y-2 w-1/3 min-w-64">
      <div className="flex gap-2">
        <Input
          placeholder="Search packages by name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
          className="flex-1"
        />
        <Button size="sm" onClick={doSearch} disabled={searching}>
          <Search className="h-4 w-4 mr-1" />
          Search
        </Button>
      </div>
      {results.length > 0 && (
        <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
          {results.map(p => (
            <div key={p.name} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{p.name}</span>
                {p.ecosystem && <span className="text-muted-foreground ml-2 text-xs">{p.ecosystem}</span>}
              </div>
              <Button size="sm" disabled={adding === p.name} onClick={() => addPackage(p.name)}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
      <div className="rounded-lg border p-4 space-y-2 w-1/3 min-w-64">
        <h2 className="text-sm font-semibold">Open Alert Summary</h2>
        <AlertSummaryBadges summary={tag.alertSummary} />
      </div>

      {/* Asset Tag Detail */}
      {tag.type === "asset" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Assets ({tag.assetTags.length})</h2>
          <AssetSearchAdd
            tagId={tag.id}
            existingIds={existingAssetIds}
            onAdded={load}
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
          <PackageAdd tagId={tag.id} existingNames={existingPkgNames} onAdded={load} />
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Package Name</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tag.packageTags.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No packages tagged</td></tr>
                )}
                {tag.packageTags.map(pt => (
                  <tr key={pt.packageName} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{pt.packageName}</td>
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
