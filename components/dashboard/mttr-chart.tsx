"use client"

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { SEVERITY_COLORS } from "@/lib/severity"

const chartConfig = {
  avgDays: { label: "Avg. Days to Resolve", color: "#3b82f6" },
} satisfies ChartConfig

const FILL: Record<string, string> = {
  Critical: SEVERITY_COLORS.critical,
  High:     SEVERITY_COLORS.high,
  Medium:   SEVERITY_COLORS.medium,
  Low:      SEVERITY_COLORS.low,
  "N/A":    SEVERITY_COLORS.na,
}

export type MttrBarData = {
  tier: "Critical" | "High" | "Medium" | "Low" | "N/A"
  avgDays: number
  count: number
}

export function MttrChart({ data }: { data: MttrBarData[] }) {
  // Always render one row per severity tier — even tiers with no resolved
  // alerts yet — rather than hiding them, so the chart reads as a fixed
  // Critical/High/Medium/Low/N/A scale instead of shrinking as data changes.
  // Fixed height matches its row neighbor, SlaSeverityChart's h-80 (320px),
  // so the card doesn't get stretched by the grid row and leave empty space.
  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ right: 64, left: 0, top: 4, bottom: 4 }}
      >
        <YAxis
          dataKey="tier"
          type="category"
          width={56}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--foreground)", fontSize: 11 }}
        />
        <XAxis dataKey="avgDays" type="number" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              hideLabel
              formatter={(value, _name, item) =>
                item.payload.count > 0 ? (
                  <span>
                    {Number(value).toFixed(1)} days avg &middot; {item.payload.count} resolved
                  </span>
                ) : (
                  <span>No resolved alerts yet</span>
                )
              }
            />
          }
        />
        <Bar dataKey="avgDays" radius={4}>
          {data.map((r) => (
            <Cell key={r.tier} fill={r.count > 0 ? FILL[r.tier] : "transparent"} />
          ))}
          <LabelList
            dataKey="avgDays"
            content={(props) => {
              const { x, y, width, height, index } = props as {
                x?: number; y?: number; width?: number; height?: number; index?: number
              }
              const row = data[index ?? -1]
              if (!row) return null
              const text = row.count > 0 ? `${row.avgDays.toFixed(1)}d` : "No data"
              return (
                <text
                  x={(x ?? 0) + (width ?? 0) + 8}
                  y={(y ?? 0) + (height ?? 0) / 2}
                  dy={4}
                  fontSize={12}
                  className={row.count > 0 ? "fill-foreground" : "fill-muted-foreground"}
                >
                  {text}
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
