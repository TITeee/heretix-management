"use client"

import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { PackageSuggestion } from "@/lib/heretix-api"

const SOURCE_LABELS: Record<string, string> = { nvd: "NVD", osv: "OSV", cna: "CNA" }

// Where a suggestion came from, as badges: the vendor the typed text matched
// (if it did), then the data sets that know the name. Shown so a name is never
// a guess.
function SuggestionBadges({ s }: { s: PackageSuggestion }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <BadgeGroup items={s.vendors} variant="secondary" />
      <BadgeGroup items={s.ecosystems} variant="outline" />
      {s.sources.map((x) => (
        <Badge key={x} variant="outline" className="font-normal text-muted-foreground">{SOURCE_LABELS[x] ?? x}</Badge>
      ))}
    </span>
  )
}

// Shows the first few of a name's vendors or ecosystems and counts the rest, with
// all of them in the tooltip: a name like http_server has a dozen vendors.
const MAX_BADGES = 2

function BadgeGroup({ items, variant, className }: {
  items: string[]
  variant: "secondary" | "outline"
  className?: string
}) {
  if (items.length === 0) return null
  const rest = items.slice(MAX_BADGES)
  return (
    <>
      {items.slice(0, MAX_BADGES).map((x) => (
        <Badge key={x} variant={variant} className={`font-normal ${className ?? ""}`}>{x}</Badge>
      ))}
      {rest.length > 0 && (
        <Badge variant="ghost" className="font-normal text-muted-foreground" title={rest.join(", ")}>+{rest.length}</Badge>
      )}
    </>
  )
}

/**
 * Package/product name input with suggestions from heretix-api.
 *
 * The name has to match what the vulnerability data actually stores, and that
 * is rarely what a user would guess: NVD keeps the raw CPE product id
 * ("http_server", not "Apache HTTP Server"), and CNA data for appliances is
 * keyed by model number ("BR-6208AC"). CNA matching in particular is exact, so
 * a near-miss silently returns nothing — suggesting real names as the user
 * types is what makes those reachable at all.
 *
 * Passing no `ecosystem` is what surfaces CNA product names: heretix-api only
 * includes them for an unfiltered query, since its rows are products rather
 * than packages of any one ecosystem.
 */
export function PackageNameInput({
  value,
  onChange,
  ecosystem,
  placeholder,
  className,
  required,
}: {
  value: string
  onChange: (value: string) => void
  ecosystem?: string
  placeholder?: string
  className?: string
  required?: boolean
}) {
  const [suggestions, setSuggestions] = useState<PackageSuggestion[]>([])
  const [show, setShow] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A suggestion search takes seconds, so one for an earlier keystroke can finish
  // after the one for the text now in the box. Only the latest request may show.
  const latestRequest = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  function handleChange(next: string) {
    onChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const requestId = ++latestRequest.current
    inFlight.current?.abort()
    const trimmed = next.trim()
    if (!trimmed) {
      setSuggestions([])
      setShow(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const q = new URLSearchParams({ q: trimmed })
      if (ecosystem) q.set("ecosystem", ecosystem)
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const res = await fetch(`/api/search/suggest?${q}`, { signal: controller.signal })
        const data = await res.json()
        if (requestId !== latestRequest.current) return
        setSuggestions(data.details ?? [])
        setShow(true)
      } catch {
        // An aborted request was replaced by a newer one, which will set the list.
        if (requestId === latestRequest.current) setSuggestions([])
      }
    }, 250)
  }

  function select(name: string) {
    // A search still running for earlier text must not reopen the list.
    latestRequest.current++
    inFlight.current?.abort()
    onChange(name)
    setSuggestions([])
    setShow(false)
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShow(true) }}
        // Delayed so a click on a suggestion lands before the list unmounts.
        onBlur={() => { setTimeout(() => setShow(false), 150) }}
        autoComplete="off"
        className={className}
        required={required}
      />
      {show && suggestions.length > 0 && (
        // Wider than the input from the start (the Search page's is narrow): a name and
        // where it was found don't fit in 12rem, and squeezing them gave a horizontal scrollbar.
        <ul className="absolute z-10 mt-1 min-w-full w-lg max-w-[90vw] max-h-60 overflow-y-auto overflow-x-hidden rounded-md border bg-popover shadow-md text-sm">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent"
                onMouseDown={(e) => { e.preventDefault(); select(s.name) }}
              >
                <span className="min-w-0 break-all font-mono">{s.name}</span>
                <SuggestionBadges s={s} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
