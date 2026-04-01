"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, Trash2 } from "lucide-react"
import { FaDocker, FaServer } from "react-icons/fa6"
import { Button } from "@/components/ui/button"
import { SEVERITY_COLORS } from "@/lib/severity"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

function DeleteButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/assets/${assetId}`, { method: "DELETE" })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete Asset</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{assetName}</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type AssetRow = {
  id: string
  name: string
  hostname: string
  assetType: string
  osName: string
  scannedAt: Date | null
  _count: { packages: number; alerts: number }
  openAlerts: { critical: number; high: number; medium: number; low: number; na: number }
  tags: { id: string; name: string; color: string | null }[]
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
      <span className="flex items-center gap-2 font-medium">
        {row.original.assetType === "docker_image"
          ? <FaDocker className="h-5 w-5 shrink-0" />
          : <FaServer className="h-5 w-5 shrink-0" />
        }
        {row.original.name || row.original.hostname}
      </span>
    ),
  },
  {
    accessorKey: "assetType",
    header: "Type",
    cell: ({ row }) => row.original.assetType === "docker_image" ? "Docker Image" : "Host",
  },
  {
    accessorKey: "hostname",
    header: "Hostname",
  },
  {
    accessorKey: "osName",
    header: "OS",
  },
  {
    accessorKey: "_count.packages",
    id: "packages",
    header: "Packages",
    cell: ({ row }) => row.original._count.packages,
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
            <Badge
              key={tag.id}
              variant="outline"
              className="text-xs font-medium"
              style={tag.color ? { color: tag.color, borderColor: tag.color } : undefined}
            >
              {tag.name}
            </Badge>
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
    cell: ({ row }) => {
      const { critical, high, medium, low, na } = row.original.openAlerts
      const total = critical + high + medium + low + na
      if (total === 0) return <Badge variant="outline">0</Badge>
      return (
        <div className="flex gap-1 flex-wrap">
          {critical > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white">{critical}</Badge>}
          {high > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white">{high}</Badge>}
          {medium > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white">{medium}</Badge>}
          {low > 0 && <Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white">{low}</Badge>}
          {na > 0 && <Badge variant="outline" className="text-muted-foreground">{na}</Badge>}
        </div>
      )
    },
  },
  {
    accessorKey: "scannedAt",
    header: "Last Scanned",
    cell: ({ row }) =>
      row.original.scannedAt
        ? new Date(row.original.scannedAt).toLocaleString("en-US")
        : "n/a",
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
