"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, Trash2 } from "lucide-react"
import { OSIcon } from "@/components/assets/os-icon"
import { AssetTypeBadge } from "@/components/assets/asset-type-badge"
import { Button } from "@/components/ui/button"
import { SeverityCountBadges } from "@/components/alerts/severity-count-badges"
import { TagBadge } from "@/components/tags/tag-badge"
import { Badge } from "@/components/ui/badge"
import { DeleteAssetDialog } from "@/components/assets/delete-asset-dialog"
import { useRouter } from "next/navigation"

function DeleteButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter()
  return (
    <DeleteAssetDialog assetId={assetId} assetName={assetName} onDeleted={() => router.refresh()}>
      {(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </DeleteAssetDialog>
  )
}

export type AssetRow = {
  id: string
  name: string
  hostname: string
  assetType: string
  osId: string
  osName: string
  scannedAt: Date | null
  /** The latest scan attempt failed (scannedAt is then the last one that worked). */
  scanFailed: boolean
  _count: { packages: number; alerts: number }
  openAlerts: { critical: number; high: number; medium: number; low: number; na: number }
  tags: { id: string; name: string; color: string | null; isDefault?: boolean }[]
  // Distinct license strings across the asset's packages; filter-only, no column.
  licenses: string[]
}

export const assetColumns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Name <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name || row.original.hostname}</span>
    ),
  },
  {
    accessorKey: "assetType",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Type <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <AssetTypeBadge assetType={row.original.assetType} className="text-foreground" />,
  },
  {
    accessorKey: "hostname",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Hostname <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <span className="text-xs">{row.original.hostname}</span>,
  },
  {
    accessorKey: "osName",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        OS <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
        <OSIcon osId={row.original.osId} osName={row.original.osName} />
        <span className="truncate max-w-40" title={row.original.osName}>
          {row.original.osName}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "_count.packages",
    id: "packages",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Packages <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original._count.packages}</span>,
  },
  {
    id: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const tags = row.original.tags
      if (tags.length === 0) return null
      return (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
      )
    },
  },
  {
    id: "openAlerts",
    accessorFn: (row) =>
      row.openAlerts.critical + row.openAlerts.high + row.openAlerts.medium + row.openAlerts.low + row.openAlerts.na,
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Open Alerts <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <SeverityCountBadges counts={row.original.openAlerts} />,
  },
  {
    accessorKey: "scannedAt",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        Last Scanned <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    // Never-scanned assets sort as older than any scanned one in both directions,
    // rather than landing wherever null happens to fall in a generic comparator.
    sortingFn: (a, b) => {
      const av = a.original.scannedAt ? new Date(a.original.scannedAt).getTime() : -Infinity
      const bv = b.original.scannedAt ? new Date(b.original.scannedAt).getTime() : -Infinity
      return av - bv
    },
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        {row.original.scannedAt ? new Date(row.original.scannedAt).toLocaleString("en-US") : "n/a"}
        {row.original.scanFailed && <Badge variant="destructive" className="font-normal">Latest scan failed</Badge>}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DeleteButton assetId={row.original.id} assetName={row.original.name || row.original.hostname} />
      </div>
    ),
  },
]
