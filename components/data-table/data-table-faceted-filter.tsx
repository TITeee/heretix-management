"use client"

import * as React from "react"
import { PlusCircleIcon, CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

export interface FacetedFilterOption {
  value: string
  label: string
}

export interface DataTableFacetedFilterProps {
  title: string
  options: FacetedFilterOption[]
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
  searchable?: boolean
}

export function DataTableFacetedFilter({
  title,
  options,
  selected,
  onSelectedChange,
  searchable,
}: DataTableFacetedFilterProps) {
  const [search, setSearch] = React.useState("")

  const filtered = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onSelectedChange(next)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed gap-1.5 font-normal" />
        }
      >
        <PlusCircleIcon className="size-4" />
        {title}
        {selected.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            {selected.size <= 2
              ? [...selected].map(v => (
                  <Badge key={v} variant="secondary" className="rounded-sm px-1 font-normal">
                    {options.find(o => o.value === v)?.label ?? v}
                  </Badge>
                ))
              : (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selected.size} selected
                  </Badge>
                )
            }
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" sideOffset={4}>
        {searchable && (
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No results</div>
          )}
          {filtered.map(option => (
            <div
              key={option.value}
              role="option"
              aria-selected={selected.has(option.value)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-default select-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggle(option.value)}
            >
              <div
                className={cn(
                  "size-4 shrink-0 rounded-sm border border-primary flex items-center justify-center",
                  selected.has(option.value)
                    ? "bg-primary text-primary-foreground"
                    : "bg-background"
                )}
              >
                {selected.has(option.value) && <CheckIcon className="size-3" />}
              </div>
              <span className="flex-1">{option.label}</span>
            </div>
          ))}
        </div>
        {selected.size > 0 && (
          <>
            <Separator />
            <div className="p-1">
              <button
                className="w-full text-center text-xs px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent cursor-default"
                onClick={() => onSelectedChange(new Set())}
              >
                Clear filters
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
