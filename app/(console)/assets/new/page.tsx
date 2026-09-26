"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Upload, FileJson } from "lucide-react"
import { useRef } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

type OverwritePreview = {
  existing: { id: string; name: string; hostname: string; scannedAt: string | null }
  diff: { added: number; removed: number; superseded: number }
}

// The hostname an import is matched on, as the file itself states it.
function hostnameInFile(inventory: { bomFormat?: string; hostname?: string; metadata?: { component?: { name?: string } } }): string {
  const raw = inventory.bomFormat === "CycloneDX" ? inventory.metadata?.component?.name : inventory.hostname
  return typeof raw === "string" ? raw.trim() : ""
}

export default function NewAssetPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [hostname, setHostname] = useState("")
  const [fileHostname, setFileHostname] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [inventory, setInventory] = useState<unknown>(null)
  const [existingHostnames, setExistingHostnames] = useState<string[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<OverwritePreview | null>(null)
  // Set when an edited hostname matches no asset, so the import would create
  // one — most likely a typo when the intent was to update an existing asset.
  const [newHostnameConfirm, setNewHostnameConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/assets")
      .then((res) => (res.ok ? res.json() : []))
      .then((assets: { hostname: string }[]) => setExistingHostnames(assets.map((a) => a.hostname)))
      .catch(() => {})
  }, [])

  async function handleFileChange(selected: File | null) {
    setFile(selected)
    setInventory(null)
    setError("")
    if (!selected) return
    try {
      const parsed = JSON.parse(await selected.text())
      const inFile = hostnameInFile(parsed)
      setInventory(parsed)
      setFileHostname(inFile)
      setHostname(inFile)
    } catch {
      setError("Invalid JSON file.")
    }
  }

  const resolvedHostname = hostname.trim() || fileHostname
  const displayName = name.trim() || resolvedHostname || undefined

  async function doImport() {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName, hostname: resolvedHostname, inventory }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to import asset.")
      return
    }

    const data = await res.json()
    router.push(`/assets/${data.id}${data.updated ? "?updated=1" : ""}`)
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!inventory) return
    setError("")
    setLoading(true)

    try {
      // Check whether this hostname already matches an existing asset before
      // committing, so a wrong file selection doesn't silently overwrite it.
      const dryRunRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName, hostname: resolvedHostname, inventory, dryRun: true }),
      })
      if (!dryRunRes.ok) {
        const data = await dryRunRes.json()
        setError(data.error ?? "Failed to import asset.")
        return
      }
      const dryRunData = await dryRunRes.json()

      if (dryRunData.existing) {
        setPreview(dryRunData)
        return
      }
      if (resolvedHostname !== fileHostname) {
        setNewHostnameConfirm(dryRunData.hostname ?? resolvedHostname)
        return
      }

      await doImport()
    } catch {
      setError("Failed to import asset.")
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      await doImport()
    } catch {
      setError("Failed to import asset.")
    } finally {
      setLoading(false)
      setPreview(null)
      setNewHostnameConfirm(null)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/assets">Assets</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Import Asset</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-bold">Import Asset</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Inventory / SBOM</CardTitle>
          <CardDescription>
            An <code>inventory.json</code> or CycloneDX SBOM from <code>heretix-cli collect</code>, Trivy, or Syft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Inventory / SBOM file</label>
              <div
                className="flex items-center gap-3 rounded-md border border-dashed px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileJson className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {file ? file.name : "Click to select a file…"}
                </span>
                <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0">
                  Browse
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                required
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="hostname" className="text-sm font-medium">Hostname</label>
              <Input
                id="hostname"
                list="existing-hostnames"
                placeholder={file ? "(not set in the file)" : "Select a file first"}
                disabled={!inventory}
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
              />
              <datalist id="existing-hostnames">
                {existingHostnames.map((h) => <option key={h} value={h} />)}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Imports are matched to an existing asset by hostname. Defaults to the value in the file;
                change it to keep updating the same asset when that value changes — e.g. Trivy names an
                image with its tag (<code>myapp:1.0</code>), so each new tag would otherwise become a new asset.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="display-name" className="text-sm font-medium">Display Name (optional)</label>
              <Input
                id="display-name"
                placeholder={resolvedHostname || "e.g. production-web-01"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown in lists. Not used for matching; defaults to the hostname.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !inventory}>
                <Upload className="mr-1 h-4 w-4" />
                {loading ? "Importing..." : "Import"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Update Existing Asset?</DialogTitle>
            <DialogDescription>
              An asset with hostname <strong>{preview?.existing.hostname}</strong> already exists
              (<strong>{preview?.existing.name}</strong>
              {preview?.existing.scannedAt && (
                <>, last scanned {new Date(preview.existing.scannedAt).toLocaleDateString()}</>
              )}). Importing will update it:
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-1.5">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">+{preview.diff.added} added</span>
                <span className="text-destructive font-medium">-{preview.diff.removed} removed</span>
              </div>
              {preview.diff.superseded > 0 && (
                <p className="text-xs text-muted-foreground">
                  {preview.diff.superseded} of the removed {preview.diff.superseded === 1 ? "version is" : "versions are"} replaced
                  by a newer version of the same package. Their open alerts move to the new version and are
                  re-checked on the next scan.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Importing..." : "Update Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newHostnameConfirm} onOpenChange={(open) => { if (!open) setNewHostnameConfirm(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Create New Asset?</DialogTitle>
            <DialogDescription>
              No asset has hostname <strong>{newHostnameConfirm}</strong>, so importing will create a new asset.
              If you meant to update an existing one, go back and check the hostname.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Back</DialogClose>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Importing..." : "Create Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
