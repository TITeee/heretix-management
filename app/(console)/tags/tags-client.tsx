"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Pencil, Trash2, Plus } from "lucide-react"
import { SEVERITY_COLORS } from "@/lib/severity"

type Tag = {
  id: string
  name: string
  type: string
  color: string | null
  description: string | null
  isDefault: boolean
  _count: { assetTags: number; packageTags: number }
  openAlerts: { critical: number; high: number; medium: number; low: number; na: number }
}

const PRESET_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#6b7280"]

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{ backgroundColor: c, borderColor: value === c ? "#000" : "transparent" }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

function TagFormDialog({
  open, onOpenChange, initial, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Tag
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [type, setType] = useState(initial?.type ?? "asset")
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[4])
  const [description, setDescription] = useState(initial?.description ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const isEdit = !!initial

  async function handleSave() {
    if (!name) return
    setLoading(true); setError("")
    try {
      const res = await fetch(isEdit ? `/api/tags/${initial!.id}` : "/api/tags", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, color, description: description || null }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Failed to save tag.")
        return
      }
      onOpenChange(false)
      onSaved()
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) { setName(initial?.name ?? ""); setType(initial?.type ?? "asset"); setColor(initial?.color ?? PRESET_COLORS[4]); setDescription(initial?.description ?? ""); setError("") } onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit Tag" : "Add Tag"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
            <Input placeholder="e.g. production" value={name} onChange={e => setName(e.target.value)} />
          </div>
          {!isEdit && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Type <span className="text-destructive">*</span></label>
              <Select value={type} onValueChange={(v) => setType(v ?? "asset")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="package">Package</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={loading || !name}>{loading ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteTagDialog({ tag, onDeleted }: { tag: Tag; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" })
    setOpen(false)
    onDeleted()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon-sm" onClick={e => { e.stopPropagation(); setOpen(true) }}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>Delete Tag</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{tag.name}</strong>?</p>
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

export function TagsClient({ tags: initialTags }: { tags: Tag[] }) {
  const router = useRouter()
  const [tags, setTags] = useState(initialTags)
  const [addOpen, setAddOpen] = useState(false)
  const [editTag, setEditTag] = useState<Tag | null>(null)

  useEffect(() => { setTags(initialTags) }, [initialTags])

  function refresh() { router.refresh() }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tags</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Tag
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Items</th>
              <th className="px-4 py-3 text-left font-medium">Open Alerts</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No tags yet</td></tr>
            )}
            {tags.map(tag => (
              <tr
                key={tag.id}
                className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => router.push(`/tags/${tag.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {tag.color && <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
                    <span className="font-medium">{tag.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize">{tag.type}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {tag.type === "asset" ? tag._count.assetTags : tag._count.packageTags}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const { critical, high, medium, low, na } = tag.openAlerts
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
                  })()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{tag.description ?? ""}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                    {!tag.isDefault && (
                      <>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditTag(tag)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteTagDialog tag={tag} onDeleted={() => { setTags(t => t.filter(x => x.id !== tag.id)); refresh() }} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && <TagFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => { setAddOpen(false); refresh() }} />}
      {editTag && (
        <TagFormDialog open={!!editTag} onOpenChange={v => { if (!v) setEditTag(null) }} initial={editTag} onSaved={() => { setEditTag(null); refresh() }} />
      )}
    </div>
  )
}
