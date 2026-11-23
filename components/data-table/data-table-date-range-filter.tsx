"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

export interface DataTableDateRangeFilterProps {
  title: string
  /** The first and last day of the range, as local days; either may be open. */
  from: Date | undefined
  to: Date | undefined
  onChange: (range: { from?: Date; to?: Date }) => void
}

const pad = (n: number) => String(n).padStart(2, "0")
const label = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function summary(from: Date | undefined, to: Date | undefined): string | null {
  if (from && to) return `${label(from)} – ${label(to)}`
  if (from) return `from ${label(from)}`
  if (to) return `until ${label(to)}`
  return null
}

/**
 * A filter button, drawn like DataTableFacetedFilter, that opens a calendar for a range of
 * days: the first click sets the first day, the second the last. Days after today cannot be
 * picked.
 */
export function DataTableDateRangeFilter({ title, from, to, onChange }: DataTableDateRangeFilterProps) {
  // The days are the browser's own: the server would word them in its time zone, and the page
  // would then differ from what the browser draws. So the range is written on the client only.
  const onClient = React.useSyncExternalStore(() => () => {}, () => true, () => false)
  const text = onClient ? summary(from, to) : null
  const selected: DateRange | undefined = from || to ? { from, to } : undefined

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 border-dashed gap-1.5 font-normal" />}
      >
        <CalendarIcon className="size-4" />
        {title}
        {text && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Badge variant="default" className="rounded-sm px-1 font-normal">{text}</Badge>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar
          mode="range"
          resetOnSelect
          defaultMonth={to ?? from}
          selected={selected}
          onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
          disabled={{ after: new Date() }}
        />
        {text && (
          <>
            <Separator />
            <div className="p-1">
              <button
                className="w-full text-center text-xs px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent cursor-default"
                onClick={() => onChange({})}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
