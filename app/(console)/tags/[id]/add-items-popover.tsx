"use client"

import { useEffect, useState } from "react"
import { CheckIcon, PlusCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

export type AddItemOption = {
  value: string
  label: string
  /** Secondary text shown after the label, and matched by the local filter. */
  detail?: string
}

/**
 * Where the options come from:
 *  - "local": the whole set, loaded each time the popover opens and filtered
 *    as the user types (assets: at most a few thousand).
 *  - "remote": searched on the server per query (package names: far too many
 *    to list).
 */
export type AddItemsSource =
  | { kind: "local"; load: () => Promise<AddItemOption[]> }
  | { kind: "remote"; search: (query: string) => Promise<AddItemOption[]> }

const SEARCH_DEBOUNCE_MS = 250

/**
 * Pick several items and add them in one go. Styled after
 * DataTableFacetedFilter, but it changes data rather than a view, so ticking a
 * box only selects: nothing is written until the Add button is pressed.
 * Items already present (`excluded`) are never offered.
 *
 * `source` must be stable across renders (define it at module level): it is an
 * effect dependency.
 */
export function AddItemsPopover({
  title,
  noun,
  source,
  excluded,
  onAdd,
}: {
  title: string
  /** Plural, lower-case: "assets", "packages". */
  noun: string
  source: AddItemsSource
  excluded: Set<string>
  onAdd: (values: string[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  // Bumped on every open, so a local source is reloaded each time (picking up
  // assets imported since) and a reply to an earlier opening is ignored.
  const [openCount, setOpenCount] = useState(0)
  const [query, setQuery] = useState("")
  // Kept by value so a remote selection survives the query changing.
  const [selected, setSelected] = useState<Map<string, AddItemOption>>(new Map())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tagged with the request it answers; anything else is stale, and "loading"
  // is simply not having the current request's answer yet.
  const [result, setResult] = useState<{ key: string; options: AddItemOption[] } | null>(null)

  const remoteQuery = source.kind === "remote" ? query.trim() : ""
  const requestKey = `${openCount}\u0000${remoteQuery}`
  const needsFetch = open && (source.kind === "local" || remoteQuery !== "")

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    const fetchOptions = source.kind === "local" ? source.load : () => source.search(remoteQuery)
    const timer = setTimeout(async () => {
      let options: AddItemOption[] = []
      try {
        options = await fetchOptions()
      } catch {
        // Shown as "No results"; the popover stays usable.
      }
      if (!cancelled) setResult({ key: requestKey, options })
    }, source.kind === "remote" ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [needsFetch, source, remoteQuery, requestKey])

  const options = needsFetch && result?.key === requestKey ? result.options : []
  const loading = needsFetch && result?.key !== requestKey

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setOpenCount((n) => n + 1)
    } else {
      setQuery("")
      setSelected(new Map())
      setError(null)
    }
  }

  function toggle(option: AddItemOption) {
    const next = new Map(selected)
    if (next.has(option.value)) next.delete(option.value)
    else next.set(option.value, option)
    setSelected(next)
  }

  async function add() {
    setAdding(true)
    setError(null)
    try {
      await onAdd([...selected.keys()])
      handleOpenChange(false)
    } catch {
      setError(`Could not add the selected ${noun}. Try again.`)
    } finally {
      setAdding(false)
    }
  }

  const q = query.trim().toLowerCase()
  const available = options.filter((o) => !excluded.has(o.value))
  const matching = source.kind === "local" && q
    ? available.filter((o) => o.label.toLowerCase().includes(q) || o.detail?.toLowerCase().includes(q))
    : available
  // A remote selection can fall out of the current results; keep it visible so
  // it can still be unticked.
  const shownValues = new Set(matching.map((o) => o.value))
  const list = [...[...selected.values()].filter((o) => !shownValues.has(o.value)), ...matching]

  let emptyText = "No results"
  if (loading) emptyText = "Loading..."
  else if (source.kind === "remote" && !q) emptyText = `Type to search ${noun}`
  else if (source.kind === "local" && options.length > 0 && available.length === 0) emptyText = `Every ${noun.replace(/s$/, "")} already has this tag`

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 border-dashed gap-1.5 font-normal" />}
      >
        <PlusCircleIcon className="size-4" />
        {title}
      </PopoverTrigger>
      <PopoverContent className="w-85 p-0" sideOffset={4}>
        <div className="p-2 border-b border-border">
          <input
            type="text"
            autoFocus
            placeholder={`Search ${noun}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {list.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
          )}
          {list.map((option) => {
            const checked = selected.has(option.value)
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={checked}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-default select-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => toggle(option)}
              >
                <div
                  className={cn(
                    "size-4 shrink-0 rounded-sm border border-primary flex items-center justify-center",
                    checked ? "bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {checked && <CheckIcon className="size-3" />}
                </div>
                <span className="truncate">{option.label}</span>
                {option.detail && (
                  <span className="ml-auto shrink-0 truncate max-w-[45%] text-xs text-muted-foreground">{option.detail}</span>
                )}
              </div>
            )
          })}
        </div>
        <Separator />
        <div className="flex items-center gap-2 p-2">
          {error
            ? <span className="flex-1 text-xs text-destructive">{error}</span>
            : <span className="flex-1 text-xs text-muted-foreground">{selected.size} selected</span>}
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelected(new Map())} disabled={adding}>
              Clear
            </Button>
          )}
          <Button size="sm" className="h-7" onClick={add} disabled={selected.size === 0 || adding}>
            {adding ? "Adding..." : `Add ${selected.size || ""}`.trim()}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
