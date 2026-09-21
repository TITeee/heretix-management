"use client"

import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis } from "recharts"
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

export type AssetBarData = {
  name: string
  critical: number
  high: number
  medium: number
  low: number
  na: number
}

const TIERS = ["critical", "high", "medium", "low", "na"] as const

// Rounds the outer (right) edge of whichever segment is the last non-zero
// one in the stack, so the bar gets a rounded end regardless of which
// tiers are present for a given asset.
function isLastSegment(row: AssetBarData, tier: (typeof TIERS)[number]) {
  const idx = TIERS.indexOf(tier)
  return row[tier] > 0 && TIERS.slice(idx + 1).every((t) => row[t] === 0)
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
    // Horizontal layout: with 10 assets, a vertical (category x-axis) chart doesn't
    // have enough width per bar to fit a name label, so recharts silently drops
    // ticks that would overlap. Laying the bars out horizontally gives each asset
    // its own row with the full card width for the name.
    <ChartContainer config={chartConfig} className="w-full" style={{ height: 280 }}>
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ right: 8, left: 0, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          width={96}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)}
          tick={{ fill: "var(--foreground)", fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
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
                radius={isLastSegment(props.payload as AssetBarData, tier) ? [0, 4, 4, 0] : 0}
              />
            )}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
