"use client"

import { useState } from "react"
import { Download, Printer } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Textarea } from "@/components/ui/textarea"

export function ReportActions({ csvHref }: { csvHref: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="size-4" /> Print / Save as PDF
      </Button>
      <a href={csvHref} className={buttonVariants({ variant: "outline" })}>
        <Download className="size-4" /> Download CSV
      </a>
    </div>
  )
}

/**
 * Room for the reader's own words, printed with the report. Not saved: it lives as long as the
 * page does, which is all a printout needs. Printed empty, it leaves a box to write in by hand.
 */
export function CommentBox() {
  const [text, setText] = useState("")
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-semibold">Comments</h2>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your own notes for this printout. They are not saved."
        className="min-h-20 print:hidden"
      />
      {/* A textarea prints at its own size, cut off; the text is printed as a block instead. */}
      <div className="hidden min-h-20 rounded-md border p-2 text-sm whitespace-pre-wrap print:block">{text}</div>
    </section>
  )
}

// A fixed size, so the chart fits an A4 page as it is drawn on screen.
const WIDTH = 680
const HEIGHT = 220

export function OpenTrendChart({ data }: { data: { day: string; open: number }[] }) {
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Too little of the period has passed to draw a trend.</p>
  }
  return (
    <LineChart width={WIDTH} height={HEIGHT} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }} className="max-w-full">
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} width={56} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
      <Line type="monotone" dataKey="open" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
    </LineChart>
  )
}
