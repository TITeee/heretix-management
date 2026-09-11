"use client"

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"

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
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(next: string) {
    onChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = next.trim()
    if (!trimmed) {
      setSuggestions([])
      setShow(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const q = new URLSearchParams({ q: trimmed })
      if (ecosystem) q.set("ecosystem", ecosystem)
      try {
        const res = await fetch(`/api/search/suggest?${q}`)
        const data = await res.json()
        setSuggestions(data.suggestions ?? [])
        setShow(true)
      } catch {
        setSuggestions([])
      }
    }, 250)
  }

  function select(name: string) {
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
        <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md text-sm">
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left font-mono hover:bg-accent"
                onMouseDown={(e) => { e.preventDefault(); select(name) }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
