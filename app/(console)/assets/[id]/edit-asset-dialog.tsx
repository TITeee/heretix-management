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
import { Pencil } from "lucide-react"

type AssetEditProps = {
  id: string
  name: string
  hostname: string
  osName: string
  osVersionId: string
}

export function EditAssetDialog({ asset }: { asset: AssetEditProps }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(asset.name)
  const [hostname, setHostname] = useState(asset.hostname)
  const [osName, setOsName] = useState(asset.osName)
  const [osVersionId, setOsVersionId] = useState(asset.osVersionId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function handleOpen() {
    setName(asset.name)
    setHostname(asset.hostname)
    setOsName(asset.osName)
    setOsVersionId(asset.osVersionId)
    setError("")
    setOpen(true)
  }

  async function handleSave() {
    if (!name || !hostname) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hostname, osName, osVersionId }),
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
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Hostname</label>
            <Input value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">OS / Product</label>
            <Input value={osName} onChange={(e) => setOsName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">OS Version</label>
            <Input value={osVersionId} onChange={(e) => setOsVersionId(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={loading || !name || !hostname}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
