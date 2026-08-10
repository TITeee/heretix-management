"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowUpDown, Pencil, Trash2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

const ECOSYSTEMS = [
  "Ubuntu:20.04:LTS",
  "Ubuntu:22.04:LTS",
  "Ubuntu:24.04:LTS",
  "Debian:11",
  "Debian:12",
  "AlmaLinux:8",
  "AlmaLinux:9",
  "Red Hat:8",
  "Red Hat:9",
  "Rocky:8",
  "Rocky:9",
  "oracle-linux",
  "Alpine:v3.18",
  "Alpine:v3.19",
  "Alpine:v3.20",
  "Alpine:v3.21",
  "npm",
  "PyPI",
  "Go",
  "Maven",
  "NuGet",
  "Packagist",
  "Other",
]

type PackageRow = {
  id: string
  name: string
  version: string
  ecosystem: string
  source: string
  location: string | null
  cpe?: string | null
  direct?: boolean | null
  alertCount: number
}

type FormState = {
  name: string
  version: string
  ecosystem: string
  location: string
  cpe: string
}

const emptyForm: FormState = { name: "", version: "", ecosystem: "", location: "", cpe: "" }

function PackageFormDialog({
  assetId,
  pkg,
  open,
  onOpenChange,
}: {
  assetId: string
  pkg?: PackageRow
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const isCpePkg = !!pkg?.cpe
  const toSelectValue = (eco: string) => ECOSYSTEMS.includes(eco) ? eco : (eco === "" ? "Other" : "Other")
  const [form, setForm] = useState<FormState>(
    pkg ? { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem, location: pkg.location ?? "", cpe: pkg.cpe ?? "" }
       : emptyForm
  )
  const [ecosystemSelect, setEcosystemSelect] = useState(pkg ? toSelectValue(pkg.ecosystem) : "")
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!pkg

  const versionChanged = isEdit && form.version !== pkg!.version

  // Reset form when dialog opens
  function handleOpenChange(v: boolean) {
    if (v) {
      setForm(
        pkg ? { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem, location: pkg.location ?? "", cpe: pkg.cpe ?? "" }
           : emptyForm
      )
      setEcosystemSelect(pkg ? toSelectValue(pkg.ecosystem) : "")
      setConfirming(false)
      setError(null)
    }
    onOpenChange(v)
  }

  function handleEcosystemChange(v: string | null) {
    const val = v ?? ""
    setEcosystemSelect(val)
    setForm(f => ({ ...f, ecosystem: val === "Other" ? "" : val }))
  }

  async function doSave() {
    setLoading(true)
    setError(null)
    try {
      const res = isEdit
        ? await fetch(`/api/assets/${assetId}/packages/${pkg!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(isCpePkg ? { name: form.name, version: form.version, cpe: form.cpe } : form),
          })
        : await fetch(`/api/assets/${assetId}/packages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? "Could not save the package.")
        return
      }
      // The package is saved either way; only the re-check against heretix-api failed,
      // so the alerts still describe the version the package had before the edit.
      if (body?.scanError) {
        setError(`Saved, but the re-scan failed: ${body.scanError}. Run Scan to refresh the alerts.`)
        router.refresh()
        return
      }
      onOpenChange(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    if (isCpePkg) {
      if (!form.name || !form.version || !form.cpe) return
    } else {
      if (!form.name || !form.version || !ecosystemSelect) return
    }
    if (versionChanged) {
      setConfirming(true)
    } else {
      doSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Package" : "Add Package"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the package information." : "Add a manually managed package to this asset."}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
              <p className="font-medium text-amber-800 dark:text-amber-300">Version change detected</p>
              <p className="text-amber-700 dark:text-amber-400">
                The open alerts for <span className="font-mono font-semibold">{pkg!.version}</span> move to <span className="font-mono font-semibold">{form.version}</span>, then the asset is scanned to check which of them still apply. Ones that no longer apply are resolved; the rest keep their status and history.
              </p>
              <p className="text-amber-700 dark:text-amber-400">This takes a moment.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button>
              <Button onClick={doSave} disabled={loading}>
                {loading ? "Saving and scanning..." : "Yes, continue"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">{isCpePkg ? "Product" : "Name"} <span className="text-destructive">*</span></label>
                <Input
                  placeholder={isCpePkg ? "e.g. FortiOS" : "e.g. nginx"}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Version <span className="text-destructive">*</span></label>
                <Input
                  placeholder="e.g. 1.24.0"
                  value={form.version}
                  onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                />
              </div>
              {isCpePkg ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium">CPE <span className="text-destructive">*</span></label>
                  <Input
                    placeholder="cpe:2.3:a:vendor:product:version:*:*:*:*:*:*:*"
                    value={form.cpe}
                    onChange={e => setForm(f => ({ ...f, cpe: e.target.value }))}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Ecosystem <span className="text-destructive">*</span></label>
                    <Select value={ecosystemSelect} onValueChange={handleEcosystemChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ecosystem" />
                      </SelectTrigger>
                      <SelectContent>
                        {ECOSYSTEMS.map(eco => (
                          <SelectItem key={eco} value={eco}>{eco}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Location</label>
                    <Input
                      placeholder="e.g. /usr/local/nginx"
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                onClick={handleSubmit}
                disabled={loading || !form.name || !form.version || (isCpePkg ? !form.cpe : !ecosystemSelect)}
              >
                {isEdit ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditButton({ assetId, pkg }: { assetId: string; pkg: PackageRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <Pencil className="h-4 w-4" />
      </Button>
      <PackageFormDialog assetId={assetId} pkg={pkg} open={open} onOpenChange={setOpen} />
    </>
  )
}

function DeleteButton({ assetId, pkg }: { assetId: string; pkg: PackageRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/assets/${assetId}/packages/${pkg.id}`, { method: "DELETE" })
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
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete Package</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{pkg.name} {pkg.version}</strong>?
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


function sortableHeader(label: string) {
  return function Header({ column }: { column: { toggleSorting: () => void } }) {
    return (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}>
        {label} <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    )
  }
}

function buildColumns(assetId: string): ColumnDef<PackageRow>[] {
  return [
    { accessorKey: "name", header: sortableHeader("Package") },
    { accessorKey: "version", header: sortableHeader("Version") },
    {
      accessorKey: "ecosystem",
      header: sortableHeader("Ecosystem"),
      cell: ({ row }) => row.original.ecosystem || "Other",
    },
    {
      accessorKey: "source",
      header: sortableHeader("Source"),
      cell: ({ row }) => (
        row.original.source === "manual"
          ? <Badge variant="outline" className="text-xs">manual</Badge>
          : <span className="text-sm">{row.original.source}</span>
      ),
    },
    {
      accessorKey: "direct",
      header: sortableHeader("Dependency"),
      // Direct sorts before indirect, with the direct/indirect-unknown packages
      // (older imports predating the flag) trailing rather than landing wherever
      // a plain boolean-to-number coercion of null happens to put them.
      sortingFn: (a, b) => {
        const rank = (v: boolean | null | undefined) => (v === true ? 0 : v === false ? 1 : 2)
        return rank(a.original.direct) - rank(b.original.direct)
      },
      cell: ({ row }) => {
        if (row.original.direct === true) return <Badge className="text-xs">Direct</Badge>
        if (row.original.direct === false) return <Badge variant="outline" className="text-xs text-muted-foreground">Indirect</Badge>
        return null
      },
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-xs block">
          {row.original.location ?? "n/a"}
        </span>
      ),
    },
    {
      id: "alerts",
      accessorFn: (row) => row.alertCount,
      header: sortableHeader("Alerts"),
      cell: ({ row }) => {
        const count = row.original.alertCount
        const href = `/alerts?assetId=${assetId}&packageName=${encodeURIComponent(row.original.name)}&packageVersion=${encodeURIComponent(row.original.version)}`
        return count > 0
          ? <Link href={href}><Badge variant="destructive" className="cursor-pointer">{count}</Badge></Link>
          : <Badge variant="outline">0</Badge>
      },
    },
    {
      id: "actions",
      cell: ({ row }) =>
        row.original.source === "manual" ? (
          <div className="flex items-center gap-1">
            <EditButton assetId={assetId} pkg={row.original} />
            <DeleteButton assetId={assetId} pkg={row.original} />
          </div>
        ) : null,
    },
  ]
}

export function PackagesTable({ data, assetId }: { data: PackageRow[]; assetId: string }) {
  const columns = buildColumns(assetId)

  const [ecosystemFilter, setEcosystemFilter] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
  const [directFilter, setDirectFilter] = useState<Set<string>>(new Set())

  const ecosystemOptions = useMemo(() =>
    [...new Set(data.map(p => p.ecosystem))].sort().map(v => ({ value: v, label: v || "Other" })),
    [data]
  )
  const sourceOptions = useMemo(() =>
    [...new Set(data.map(p => p.source))].sort().map(v => ({ value: v, label: v })),
    [data]
  )
  const directOptions = [
    { value: "true", label: "Direct" },
    { value: "false", label: "Indirect" },
  ]

  const filteredData = useMemo(() => data.filter(p => {
    if (ecosystemFilter.size > 0 && !ecosystemFilter.has(p.ecosystem)) return false
    if (sourceFilter.size > 0 && !sourceFilter.has(p.source)) return false
    if (directFilter.size > 0 && !directFilter.has(String(p.direct))) return false
    return true
  }), [data, ecosystemFilter, sourceFilter, directFilter])

  const hasFilter = ecosystemFilter.size > 0 || sourceFilter.size > 0 || directFilter.size > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="Ecosystem"
          options={ecosystemOptions}
          selected={ecosystemFilter}
          onSelectedChange={setEcosystemFilter}
        />
        <DataTableFacetedFilter
          title="Source"
          options={sourceOptions}
          selected={sourceFilter}
          onSelectedChange={setSourceFilter}
        />
        <DataTableFacetedFilter
          title="Dependency"
          options={directOptions}
          selected={directFilter}
          onSelectedChange={setDirectFilter}
        />
        {hasFilter && (
          <Button variant="ghost" size="sm"
            onClick={() => { setEcosystemFilter(new Set()); setSourceFilter(new Set()); setDirectFilter(new Set()) }}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={filteredData}
        filterColumn="name"
        filterPlaceholder="Search packages..."
      />
    </div>
  )
}
