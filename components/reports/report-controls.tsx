"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import type { PeriodChoice } from "@/lib/reports/request"

const CHOICES: { value: PeriodChoice; label: string }[] = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "since", label: "Since a day" },
]

// The calendar works in local dates; the report's days are written YYYY-MM-DD.
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** The first day of a period that runs up to now; today and later cannot be picked. */
function DayPicker({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const [open, setOpen] = useState(false)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="w-60 justify-start font-normal" />}>
        <CalendarIcon className="size-4" />
        {day} – now
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          defaultMonth={toDate(day)}
          selected={toDate(day)}
          onSelect={(picked) => {
            if (picked) onChange(toDay(picked))
            setOpen(false)
          }}
          disabled={{ after: yesterday }}
        />
      </PopoverContent>
    </Popover>
  )
}

type Props = {
  tags: { id: string; name: string }[]
  /** The conditions shown at first: the report's own, or the defaults. The day is YYYY-MM-DD. */
  initial: { choice: PeriodChoice; since: string; tagIds: string[] }
}

/** The executive report's conditions; Generate puts them in the URL, which makes the report. */
export function ReportControls({ tags, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState(initial.choice)
  const [since, setSince] = useState(initial.since)
  const [tagIds, setTagIds] = useState(initial.tagIds)

  const generate = () => {
    const params = new URLSearchParams({ period: choice })
    if (choice === "since") params.set("since", since)
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
      {choice === "since" && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <DayPicker day={since} onChange={setSince} />
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
