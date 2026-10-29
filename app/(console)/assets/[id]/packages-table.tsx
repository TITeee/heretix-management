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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SEVERITY_COLORS } from "@/lib/severity"
import { isWindowsServerOs, rolesNotInstalled, WINDOWS_FEATURE_ROLES } from "@/lib/windows-roles"
import { cutExplanation, cutLabel } from "@/lib/findings-cut"
import { isOsEcosystem } from "@/lib/remediation"
import { ArrowUpDown, ChevronDown, ChevronRight, ExternalLink, Pencil, Trash2, X } from "lucide-react"
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
  scope?: string | null
  category?: string | null
  /** The source package a distro binary package was split from; null when it is its own source (see sourcePackageOf). */
  sourcePackage?: string | null
  licenses?: string[]
  windowsFeatures?: string[]
  findingsCut?: boolean
  findingsMatched?: number | null
  findingsReturned?: number | null
  alertCount: number
  alertSeverities: { critical: number; high: number; medium: number; low: number; na: number }
}

/**
 * The source package to show for a row. The inventory leaves it null when a distro package is its
 * own source (bash, apt), so an OS package without one is its own source; a language package or a
 * product registered by hand has no source package at all.
 */
function sourcePackageOf(p: Pick<PackageRow, "name" | "ecosystem" | "source" | "sourcePackage">): string | null {
  if (p.sourcePackage) return p.sourcePackage
  return p.source !== "manual" && p.ecosystem !== "" && isOsEcosystem(p.ecosystem) ? p.name : null
}

// scope=excluded covers three different reasons: an npm dev dependency (pruned
// from a production install); per heretix-cli's heretix:category property, an
// OS package that ships in the image but never runs (kernel headers,
// compiler/linker toolchain); or a language package the distro's own package
// manager installed ("os-managed", see lib/cyclonedx.ts), whose findings belong
// to that OS package. category is null for the dev-dependency case.
function nonRuntimeCategory(p: { scope?: string | null; category?: string | null }): "kernel" | "build" | "osmanaged" | "devonly" | null {
  if (p.category === "kernel") return "kernel"
  if (p.category === "build") return "build"
  if (p.category === "os-managed") return "osmanaged"
  if (p.scope === "excluded") return "devonly"
  return null
}

const SCOPE_LABELS: Record<NonNullable<ReturnType<typeof nonRuntimeCategory>>, string> = {
  kernel: "Kernel",
  build: "Build",
  osmanaged: "OS-managed",
  devonly: "Dev-only",
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


// Several licenses collapse to the first one plus the total, expanding on
// click like the Alerts table's grouped packages, so one package with many
// licenses doesn't stretch its row.
function LicenseCell({ licenses }: { licenses: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (licenses.length === 0) return <span className="text-xs text-muted-foreground">None</span>
  if (licenses.length === 1) {
    return <span className="block text-xs truncate max-w-xs" title={licenses[0]}>{licenses[0]}</span>
  }
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
        className="flex items-center gap-1 max-w-xs hover:underline"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="truncate" title={licenses[0]}>{licenses[0]}</span>
        <span className="text-muted-foreground shrink-0">({licenses.length})</span>
      </button>
      {expanded && (
        <ul className="mt-1 text-muted-foreground list-disc list-inside">
          {licenses.map(l => <li key={l} className="truncate max-w-xs" title={l}>{l}</li>)}
        </ul>
      )}
    </div>
  )
}

// The optional features installed on a Windows Server, which the scan uses to
// set aside the findings of server roles the server does not run (see
// lib/windows-roles.ts). Shown on the OS package's row so it is visible why
// an alert was set aside, and whether the list was collected at all.
function WindowsFeaturesButton({ pkg }: { pkg: PackageRow }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rolesOnly, setRolesOnly] = useState(false)
  // Features that install a role the scan judges by come first, then the rest.
  const features = [...(pkg.windowsFeatures ?? [])].sort((a, b) =>
    Number(!!WINDOWS_FEATURE_ROLES[b]) - Number(!!WINDOWS_FEATURE_ROLES[a]) || a.localeCompare(b)
  )
  const roleFeatureCount = features.filter((f) => WINDOWS_FEATURE_ROLES[f]).length
  const needle = query.trim().toLowerCase()
  const shown = features.filter((f) =>
    (!rolesOnly || WINDOWS_FEATURE_ROLES[f]) &&
    (f.toLowerCase().includes(needle) || (WINDOWS_FEATURE_ROLES[f] ?? "").toLowerCase().includes(needle))
  )
  const notInstalled = rolesNotInstalled(features)
  const byHand = pkg.source === "manual"
  const known = features.length > 0
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="ml-2 align-middle"
        title="Installed optional features"
      >
        <Badge
          variant="outline"
          className={
            "cursor-pointer rounded-md text-xs font-medium " +
            (known
              ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
              : "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900")
          }
        >
          {known ? `${features.length} features` : "features unknown"}
        </Badge>
      </button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setQuery(""); setRolesOnly(false) } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Installed features: {pkg.name}</DialogTitle>
            <DialogDescription>
              {known
                ? "The optional features installed on the server. A CVE in a server role is set aside as Not affected when none of the features that role needs is installed, and reopened if one is installed later."
                : byHand
                  ? "This package was added by hand, so the server's installed features are not known and every role finding stays open."
                  : "No feature list was collected: the SBOM came from an older heretix-cli, or the list could not be read. Every role finding stays open. Update from an SBOM made by heretix-cli 0.5.0 or later to enable it."}
            </DialogDescription>
          </DialogHeader>
          {known && (
            <div className="space-y-3">
              <p className="text-xs">
                <span className="font-medium">Roles not installed (their CVEs are set aside): </span>
                {notInstalled.length === 0
                  ? <span className="text-muted-foreground">none, every role this check knows is installed</span>
                  : <span className="text-muted-foreground">{notInstalled.join(", ")}</span>}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Filter features or roles..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={rolesOnly ? "default" : "outline"}
                  onClick={() => setRolesOnly((v) => !v)}
                  title="Only the features that install a role this check can tell apart"
                >
                  Role features only ({roleFeatureCount})
                </Button>
                <span className="text-xs text-muted-foreground">
                  {shown.length === features.length ? `${features.length} features` : `${shown.length} of ${features.length}`}
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">No feature matches.</TableCell>
                      </TableRow>
                    ) : shown.map((f) => (
                      <TableRow key={f}>
                        <TableCell className="text-right text-xs text-muted-foreground">{features.indexOf(f) + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{f}</TableCell>
                        <TableCell className="text-xs">
                          {WINDOWS_FEATURE_ROLES[f]
                            ? <Badge variant="outline" className="rounded-md border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">{WINDOWS_FEATURE_ROLES[f]}</Badge>
                            : <span className="text-muted-foreground" title="Not the install of a server role this check tells apart: a feature every server has, or one it does not judge by.">Not a role</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    {
      accessorKey: "name",
      header: sortableHeader("Package"),
      cell: ({ row }) => (
        <>
          {row.original.name}
          {isWindowsServerOs(row.original) && <WindowsFeaturesButton pkg={row.original} />}
          {row.original.findingsCut && (
            <Badge
              variant="outline"
              className="ml-2 rounded-md border-amber-400 bg-amber-100 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200"
              title={cutExplanation({ findingsMatched: row.original.findingsMatched ?? null, findingsReturned: row.original.findingsReturned ?? null })}
            >
              {cutLabel({ findingsMatched: row.original.findingsMatched ?? null, findingsReturned: row.original.findingsReturned ?? null })} findings
            </Badge>
          )}
        </>
      ),
    },
    {
      // Which source package this binary came from (libssl3 <- openssl), the same unit the
      // Remediation tab groups OS updates by. Empty for packages with no such split.
      id: "sourcePackage",
      accessorFn: (row) => sourcePackageOf(row) ?? "",
      header: sortableHeader("Source Package"),
      cell: ({ row }) => {
        const source = sourcePackageOf(row.original)
        return source ? <span className="text-sm">{source}</span> : null
      },
    },
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
      accessorKey: "scope",
      header: sortableHeader("Scope"),
      // Non-runtime sorts first so it's easy to spot; everything else (required
      // or unknown — older imports predating this field) is equivalent here.
      sortingFn: (a, b) => {
        const rank = (v: string | null) => (v ? 0 : 1)
        return rank(nonRuntimeCategory(a.original)) - rank(nonRuntimeCategory(b.original))
      },
      cell: ({ row }) => {
        const category = nonRuntimeCategory(row.original)
        if (!category) return null
        const label = SCOPE_LABELS[category]
        return (
          <Badge
            variant="outline"
            className="text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800"
          >
            {label}
          </Badge>
        )
      },
    },
    {
      id: "licenses",
      // Rows without a license (none reported, or imported before this field)
      // sort last.
      accessorFn: (row) => row.licenses?.length ? row.licenses.join(", ") : undefined,
      sortUndefined: "last",
      header: sortableHeader("License"),
      cell: ({ row }) => <LicenseCell licenses={row.original.licenses ?? []} />,
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
      // Sorted by how severe the worst finding is, not by total count — "which
      // packages have criticals" is the more useful sort for triage than raw
      // volume, and a package's own name/version is already there for anyone
      // sorting by inspection instead.
      accessorFn: (row) => {
        const s = row.alertSeverities
        return s.critical * 1_000_000 + s.high * 10_000 + s.medium * 100 + s.low
      },
      header: sortableHeader("Alerts"),
      cell: ({ row }) => {
        const { critical, high, medium, low, na } = row.original.alertSeverities
        const count = row.original.alertCount
        if (count === 0) return <Badge variant="outline" className="rounded-md">0</Badge>
        const severityHref = (severity: string) =>
          `/alerts?assetId=${assetId}&packageName=${encodeURIComponent(row.original.name)}&packageVersion=${encodeURIComponent(row.original.version)}&severity=${severity}`
        const totalHref = `/alerts?assetId=${assetId}&packageName=${encodeURIComponent(row.original.name)}&packageVersion=${encodeURIComponent(row.original.version)}`
        return (
          <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
            {critical > 0 && <Link href={severityHref("CRITICAL")}><Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white cursor-pointer rounded-md">{critical}</Badge></Link>}
            {high > 0 && <Link href={severityHref("HIGH")}><Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white cursor-pointer rounded-md">{high}</Badge></Link>}
            {medium > 0 && <Link href={severityHref("MEDIUM")}><Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white cursor-pointer rounded-md">{medium}</Badge></Link>}
            {low > 0 && <Link href={severityHref("LOW")}><Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white cursor-pointer rounded-md">{low}</Badge></Link>}
            {na > 0 && <Link href={severityHref("UNKNOWN")}><Badge style={{ backgroundColor: SEVERITY_COLORS.na }} className="text-neutral-900 cursor-pointer rounded-md">{na}</Badge></Link>}
            <Link href={totalHref} title={`All ${count} alerts for this package`}>
              <ExternalLink className="h-4 w-4 text-foreground" />
            </Link>
          </div>
        )
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
  const columns = useMemo(() => buildColumns(assetId), [assetId])

  const [ecosystemFilter, setEcosystemFilter] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
  const [sourcePackageFilter, setSourcePackageFilter] = useState<Set<string>>(new Set())
  const [directFilter, setDirectFilter] = useState<Set<string>>(new Set())
  const [scopeFilter, setScopeFilter] = useState<Set<string>>(new Set())
  const [licenseFilter, setLicenseFilter] = useState<Set<string>>(new Set())

  const ecosystemOptions = useMemo(() =>
    [...new Set(data.map(p => p.ecosystem))].sort().map(v => ({ value: v, label: v || "Other" })),
    [data]
  )
  const sourceOptions = useMemo(() =>
    [...new Set(data.map(p => p.source))].sort().map(v => ({ value: v, label: v })),
    [data]
  )
  const sourcePackageOptions = useMemo(() =>
    [...new Set(data.map(sourcePackageOf).filter((s): s is string => !!s))].sort().map(v => ({ value: v, label: v })),
    [data]
  )
  const licenseOptions = useMemo(() =>
    [...new Set(data.flatMap(p => p.licenses ?? []))].sort().map(v => ({ value: v, label: v })),
    [data]
  )
  const directOptions = [
    { value: "true", label: "Direct" },
    { value: "false", label: "Indirect" },
  ]
  const scopeOptions = [
    { value: "kernel", label: "Kernel" },
    { value: "build", label: "Build" },
    { value: "osmanaged", label: "OS-managed" },
    { value: "devonly", label: "Dev-only" },
    { value: "other", label: "Required" },
  ]

  const filteredData = useMemo(() => data.filter(p => {
    if (ecosystemFilter.size > 0 && !ecosystemFilter.has(p.ecosystem)) return false
    if (sourceFilter.size > 0 && !sourceFilter.has(p.source)) return false
    if (sourcePackageFilter.size > 0 && !sourcePackageFilter.has(sourcePackageOf(p) ?? "")) return false
    if (directFilter.size > 0 && !directFilter.has(String(p.direct))) return false
    if (scopeFilter.size > 0 && !scopeFilter.has(nonRuntimeCategory(p) ?? "other")) return false
    if (licenseFilter.size > 0 && !(p.licenses ?? []).some(l => licenseFilter.has(l))) return false
    return true
  }), [data, ecosystemFilter, sourceFilter, sourcePackageFilter, directFilter, scopeFilter, licenseFilter])

  const hasFilter = ecosystemFilter.size > 0 || sourceFilter.size > 0 || sourcePackageFilter.size > 0 || directFilter.size > 0 || scopeFilter.size > 0 || licenseFilter.size > 0

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
        {sourcePackageOptions.length > 0 && (
          <DataTableFacetedFilter
            title="Source Package"
            options={sourcePackageOptions}
            selected={sourcePackageFilter}
            onSelectedChange={setSourcePackageFilter}
            searchable
          />
        )}
        <DataTableFacetedFilter
          title="Dependency"
          options={directOptions}
          selected={directFilter}
          onSelectedChange={setDirectFilter}
        />
        <DataTableFacetedFilter
          title="Scope"
          options={scopeOptions}
          selected={scopeFilter}
          onSelectedChange={setScopeFilter}
        />
        <DataTableFacetedFilter
          title="License"
          options={licenseOptions}
          selected={licenseFilter}
          onSelectedChange={setLicenseFilter}
          searchable
        />
        {hasFilter && (
          <Button variant="ghost" size="sm"
            onClick={() => { setEcosystemFilter(new Set()); setSourceFilter(new Set()); setSourcePackageFilter(new Set()); setDirectFilter(new Set()); setScopeFilter(new Set()); setLicenseFilter(new Set()) }}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={filteredData}
        filterColumn="name"
        filterPlaceholder="Search packages..."
        initialSorting={[{ id: "alerts", desc: true }]}
        initialColumnVisibility={{ location: false }}
        initialPageSize={15}
      />
    </div>
  )
}
