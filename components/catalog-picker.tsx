"use client"

import { useEffect, useRef, useState } from "react"
import { Library, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { CatalogListing } from "@/lib/heretix-api"
import { CATALOG_SOURCE_LABELS, CATEGORY_LABELS, describeCatalogPairs } from "@/lib/catalog-display"

/**
 * Picks a hand-registered product from heretix-api's catalog, so nobody has to
 * know how NVD files it (BIG-IP is "f5" and some ninety "big-ip_..." names;
 * "automation" belongs to both ivanti and nintex).
 *
 * A search by a catalog name asks only the NVD and CVE-record rows the entry
 * lists, and says so here: the picked entry shows those rows rather than just a
 * name. It renders nothing when heretix-api has no catalog (an older version),
 * and the dialog around it works as it always did.
 */
/** The rows a search by the entry's name asks, one per line, so what will be searched is on screen. */
export function CatalogPairs({ entry, className }: { entry: CatalogListing; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">A search by this name asks only:</p>
      {describeCatalogPairs(entry).map((line) => (
        <p key={line} className="break-all font-mono text-xs">{line}</p>
      ))}
    </div>
  )
}

/**
 * Until something is picked it is a button ("Choose from catalog (78)"), so it does
 * not read as one more text box next to the package name; pressing it opens the
 * search and the list.
 *
 * compact is for a single row of controls (the Search page): the button takes
 * its width from className, a picked entry is a small chip, and the rows it
 * searches are left to the caller to show with CatalogPairs.
 */
export function CatalogPicker({
  value,
  onChange,
  compact = false,
  hint,
  className,
}: {
  value: CatalogListing | null
  onChange: (entry: CatalogListing | null) => void
  compact?: boolean
  /** A line under the button, e.g. where to type the name instead. */
  hint?: string
  className?: string
}) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [initial, setInitial] = useState<CatalogListing[]>([])
  const [entries, setEntries] = useState<CatalogListing[]>([])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // As in PackageNameInput: only the latest request may set the list.
  const latestRequest = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  // The whole catalog, once: it is what an empty box shows, and it tells whether there is a catalog at all.
  useEffect(() => {
    let cancelled = false
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((data: { available: boolean; entries: CatalogListing[] }) => {
        if (cancelled) return
        setAvailable(data.available)
        setInitial(data.entries)
        setEntries(data.entries)
      })
      .catch(() => { if (!cancelled) setAvailable(false) })
    return () => { cancelled = true }
  }, [])

  function handleChange(next: string) {
    setQuery(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const requestId = ++latestRequest.current
    inFlight.current?.abort()
    const trimmed = next.trim()
    if (!trimmed) {
      setEntries(initial)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const res = await fetch(`/api/catalog?${new URLSearchParams({ q: trimmed })}`, { signal: controller.signal })
        const data = await res.json()
        if (requestId !== latestRequest.current) return
        setEntries(data.entries ?? [])
      } catch {
        // An aborted request was replaced by a newer one, which will set the list.
        if (requestId === latestRequest.current) setEntries([])
      }
    }, 200)
  }

  function reset() {
    latestRequest.current++
    inFlight.current?.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery("")
    setEntries(initial)
  }

  function select(entry: CatalogListing) {
    setOpen(false)
    reset()
    onChange(entry)
  }

  if (!available) return null

  if (value && compact) {
    return (
      <div className={`flex h-8 items-center justify-between gap-2 rounded-lg border bg-muted/40 pl-2.5 pr-1 text-sm ${className ?? ""}`}>
        <span className="truncate font-medium" title={value.name}>{value.name}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Choose another product" onClick={() => onChange(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  if (value) {
    return (
      <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">{value.name}</div>
            <div className="text-xs text-muted-foreground">
              {value.vendor} · {CATEGORY_LABELS[value.category] ?? value.category}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Change</Button>
        </div>
        <CatalogPairs entry={value} className="space-y-0.5" />
      </div>
    )
  }

  const picker = (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700",
              "dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30 dark:hover:text-blue-200",
              className,
            )}
          />
        }
      >
        <Library className="h-4 w-4" />
        <span className="truncate">Choose from catalog ({initial.length})</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-lg max-w-[90vw] p-0"
      >
        <div className="border-b p-2">
          <Input
            placeholder="Search by vendor or product (e.g. ivanti, big-ip)"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            autoComplete="off"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto overflow-x-hidden text-sm">
          {entries.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Nothing in the catalog matches. Close this and type the name instead.</li>
          )}
          {entries.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent"
                onClick={() => select(e)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge variant="secondary" className="font-normal">{CATEGORY_LABELS[e.category] ?? e.category}</Badge>
                    {e.sources.map((x) => (
                      <Badge key={x} variant="outline" className="font-normal text-muted-foreground">{CATALOG_SOURCE_LABELS[x] ?? x}</Badge>
                    ))}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{e.vendor} · e.g. version {e.versionHint}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
  if (!hint) return picker
  return (
    <div className="space-y-1.5">
      {picker}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
