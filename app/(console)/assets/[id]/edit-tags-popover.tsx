"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, Pencil } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { TagBadge } from "@/components/tags/tag-badge"

type AssetTagOption = { id: string; name: string; color: string | null }

/**
 * Edits which asset tags this asset carries. Unlike the tag page's add-only
 * popover, this lists every asset tag with the assigned ones ticked, since a
 * handful of tags fits in one list and the current state is right there to
 * compare against. Ticking only stages the change; Apply sends it.
 */
export function EditTagsPopover({ assetId, assignedIds }: { assetId: string; assignedIds: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<AssetTagOption[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setChecked(new Set(assignedIds))
    setQuery("")
    setError(null)
    setTags(null)
    try {
      const res = await fetch("/api/tags")
      if (!res.ok) throw new Error(`tags: ${res.status}`)
      const all: (AssetTagOption & { type: string })[] = await res.json()
      setTags(all.filter((t) => t.type === "asset").sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setTags([])
      setError("Could not load tags.")
    }
  }

  function toggle(id: string) {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  const assigned = new Set(assignedIds)
  const add = [...checked].filter((id) => !assigned.has(id))
  const remove = assignedIds.filter((id) => !checked.has(id))
  const changes = add.length + remove.length

  async function apply() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/assets/${assetId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add, remove }),
      })
      if (!res.ok) throw new Error(`asset tags: ${res.status}`)
      setOpen(false)
      router.refresh()
    } catch {
      setError("Could not update tags. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const q = query.trim().toLowerCase()
  const shown = (tags ?? []).filter((t) => !q || t.name.toLowerCase().includes(q))

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit tags" title="Edit tags" />}>
        <Pencil className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" sideOffset={4}>
        <div className="p-2 border-b border-border">
          <input
            type="text"
            autoFocus
            placeholder="Search tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {tags === null && <div className="px-2 py-4 text-center text-xs text-muted-foreground">Loading...</div>}
          {tags !== null && tags.length === 0 && !error && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No asset tags yet. <Link href="/tags" className="underline hover:text-foreground">Create one</Link>
            </div>
          )}
          {tags !== null && tags.length > 0 && shown.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No results</div>
          )}
          {shown.map((tag) => {
            const isChecked = checked.has(tag.id)
            return (
              <div
                key={tag.id}
                role="option"
                aria-selected={isChecked}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-default select-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => toggle(tag.id)}
              >
                <div
                  className={cn(
                    "size-4 shrink-0 rounded-sm border border-primary flex items-center justify-center",
                    isChecked ? "bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {isChecked && <CheckIcon className="size-3" />}
                </div>
                <TagBadge tag={tag} />
              </div>
            )
          })}
        </div>
        <Separator />
        <div className="flex items-center gap-2 p-2">
          {error
            ? <span className="flex-1 text-xs text-destructive">{error}</span>
            : <span className="flex-1 text-xs text-muted-foreground">
                {changes === 0 ? "No changes" : `${add.length} to add, ${remove.length} to remove`}
              </span>}
          <Button size="sm" className="h-7" onClick={apply} disabled={changes === 0 || saving}>
            {saving ? "Applying..." : "Apply"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
