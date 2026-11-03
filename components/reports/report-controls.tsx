"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon, Loader2 } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import type { PeriodChoice } from "@/lib/reports/request"

const CHOICES: { value: PeriodChoice; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "custom", label: "Custom" },
]

// The calendar works in local dates; the report's days are written YYYY-MM-DD.
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/**
 * The first and the last day on one calendar: the first click picks the first day, the second
 * the last (or the first, when it is earlier), and the calendar closes.
 */
function DaysPicker({ firstDay, lastDay, onChange }: { firstDay: string; lastDay: string; onChange: (first: string, last: string) => void }) {
  const [open, setOpen] = useState(false)
  // The first day clicked, while the last is still to be clicked.
  const [start, setStart] = useState<Date | null>(null)
  const selected: DateRange = start ? { from: start, to: undefined } : { from: toDate(firstDay), to: toDate(lastDay) }

  const pick = (day: Date) => {
    if (!start) {
      setStart(day)
      return
    }
    const [a, b] = day < start ? [day, start] : [start, day]
    onChange(toDay(a), toDay(b))
    setStart(null)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); setStart(null) }}>
      <PopoverTrigger render={<Button variant="outline" className="w-60 justify-start font-normal" />}>
        <CalendarIcon className="size-4" />
        {firstDay} – {lastDay}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={toDate(firstDay)}
          selected={selected}
          onSelect={(_, day) => pick(day)}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  )
}

type Props = {
  tags: { id: string; name: string }[]
  /** The conditions shown at first: the report's own, or the defaults. Days are YYYY-MM-DD. */
  initial: { choice: PeriodChoice; firstDay: string; lastDay: string; tagIds: string[] }
}

/** The executive report's conditions; Generate puts them in the URL, which makes the report. */
export function ReportControls({ tags, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState(initial.choice)
  const [firstDay, setFirstDay] = useState(initial.firstDay)
  const [lastDay, setLastDay] = useState(initial.lastDay)
  const [tagIds, setTagIds] = useState(initial.tagIds)

  const generate = () => {
    const params = new URLSearchParams({ period: choice })
    if (choice === "custom") {
      params.set("from", firstDay)
      params.set("to", lastDay)
    }
    // No tag chosen: the report covers every asset, as on the Alerts list.
    if (tagIds.length > 0) params.set("tags", tagIds.join(","))
    startTransition(() => router.push(`/reports/executive?${params}`))
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Period</span>
        <Select value={choice} onValueChange={(v) => { if (v) setChoice(v as PeriodChoice) }}>
          <SelectTrigger className="w-40">
            <SelectValue>{CHOICES.find((c) => c.value === choice)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      {choice === "custom" && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Days</span>
          <DaysPicker firstDay={firstDay} lastDay={lastDay} onChange={(first, last) => { setFirstDay(first); setLastDay(last) }} />
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Asset tags</span>
        <DataTableFacetedFilter
          title="Tags"
          options={tags.map((t) => ({ value: t.id, label: t.name }))}
          selected={new Set(tagIds)}
          // Kept in the tags' own order, so the report's rows follow it whatever the order of the clicks.
          onSelectedChange={(next) => setTagIds(tags.filter((t) => next.has(t.id)).map((t) => t.id))}
          searchable
        />
      </div>
      <Button onClick={generate} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Generating…" : "Generate"}
      </Button>
      {pending && <span className="text-sm text-muted-foreground">This can take up to half a minute on a large fleet.</span>}
    </div>
  )
}
