"use client"

import { Bar, BarChart, CartesianGrid, Rectangle, XAxis } from "recharts"
import type { BarShapeProps } from "recharts/types/cartesian/Bar"
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

export type SlaSeverityBarData = {
  status: string
  critical: number
  high: number
  medium: number
  low: number
  na: number
}

const TIERS = ["critical", "high", "medium", "low", "na"] as const

function isTopSegment(row: SlaSeverityBarData, tier: (typeof TIERS)[number]) {
  const idx = TIERS.indexOf(tier)
  return row[tier] > 0 && TIERS.slice(idx + 1).every((t) => row[t] === 0)
}

export function SlaSeverityChart({ data }: { data: SlaSeverityBarData[] }) {
  const total = data.reduce((sum, d) => sum + d.critical + d.high + d.medium + d.low + d.na, 0)

  if (total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="status"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          interval={0}
          tick={{ fill: "var(--foreground)", fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* @ts-expect-error recharts/shadcn type mismatch */}
        <ChartLegend content={(props) => <ChartLegendContent {...props} />} />
        {TIERS.map((tier) => (
          <Bar
            key={tier}
            dataKey={tier}
            name={chartConfig[tier].label}
            stackId="a"
            fill={`var(--color-${tier})`}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                radius={isTopSegment(props.payload as SlaSeverityBarData, tier) ? [4, 4, 0, 0] : 0}
              />
            )}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
