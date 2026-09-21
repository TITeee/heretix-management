"use client"

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
  opened:   { label: "New Alerts",      color: "#ef4444" },
  resolved: { label: "Resolved Alerts", color: "#16a34a" },
} satisfies ChartConfig

export type AlertsTrendData = { week: string; opened: number; resolved: number }

export function AlertsTrend({ data }: { data: AlertsTrendData[] }) {
  if (data.every((d) => d.opened === 0 && d.resolved === 0)) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height: 266 }}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* @ts-expect-error recharts/shadcn type mismatch */}
        <ChartLegend content={(props) => <ChartLegendContent {...props} />} />
        <Area
          type="monotone"
          dataKey="opened"
          stroke="var(--color-opened)"
          fill="var(--color-opened)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke="var(--color-resolved)"
          fill="var(--color-resolved)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
