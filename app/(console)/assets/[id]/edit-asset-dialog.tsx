"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pencil } from "lucide-react"

type AssetEditProps = {
  id: string
  name: string
  hostname: string
  assetType: string
  // Registered by hand (Add Manually / Import CSV) rather than from an SBOM.
  isManual: boolean
}

export function EditAssetDialog({ asset }: { asset: AssetEditProps }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(asset.name)
  const [hostname, setHostname] = useState(asset.hostname)
  const [assetType, setAssetType] = useState(asset.assetType)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function handleOpen() {
    setName(asset.name)
    setHostname(asset.hostname)
    setAssetType(asset.assetType)
    setError("")
    setOpen(true)
  }

  const hostnameChanged = hostname.trim() !== asset.hostname

  async function handleSave() {
    if (!name.trim() || !hostname.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hostname, ...(asset.isManual && { assetType }) }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to update asset.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <Pencil className="h-4 w-4 mr-1" /> Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="edit-asset-name" className="text-sm font-medium">Name</label>
            <Input id="edit-asset-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-asset-hostname" className="text-sm font-medium">Hostname</label>
            <Input id="edit-asset-hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            {!asset.isManual && (
              <p className={hostnameChanged ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                SBOM imports are matched to this asset by hostname. After changing it, an SBOM that still
                carries the old name, or a CI job sending the old <code>?hostname=</code>, will create a new
                asset instead. Update from SBOM on this page keeps working.
              </p>
            )}
          </div>
          {asset.isManual && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={assetType} onValueChange={(v) => { if (v) setAssetType(v) }}>
                <SelectTrigger className="w-40">
                  <SelectValue>{assetType === "docker_image" ? "Docker Image" : "Host"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">Host</SelectItem>
                  <SelectItem value="docker_image">Docker Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={loading || !name.trim() || !hostname.trim()}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
