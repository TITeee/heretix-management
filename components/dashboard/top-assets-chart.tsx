"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { SEVERITY_COLORS } from "@/lib/severity"

const chartConfig = {
  critical: { label: "Critical", color: SEVERITY_COLORS.critical },
  high:     { label: "High",     color: SEVERITY_COLORS.high },
  medium:   { label: "Medium",   color: SEVERITY_COLORS.medium },
  low:      { label: "Low",      color: SEVERITY_COLORS.low },
  na:       { label: "N/A",      color: SEVERITY_COLORS.na },
} satisfies ChartConfig

export type AssetBarData = {
  name: string
  critical: number
  high: number
  medium: number
  low: number
  na: number
}

export function TopAssetsChart({ data }: { data: AssetBarData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig}>
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="name"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="critical" name="Critical" stackId="a" fill="var(--color-critical)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="high"     name="High"     stackId="a" fill="var(--color-high)"     radius={[0, 0, 0, 0]} />
        <Bar dataKey="medium"   name="Medium"   stackId="a" fill="var(--color-medium)"   radius={[0, 0, 0, 0]} />
        <Bar dataKey="low"      name="Low"      stackId="a" fill="var(--color-low)"      radius={[0, 0, 0, 0]} />
        <Bar dataKey="na"       name="N/A"      stackId="a" fill="var(--color-na)"       radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
