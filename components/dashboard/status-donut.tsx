"use client"

import { PieChart, Pie, Cell } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/severity"

const chartConfig = {
  open:        { label: "Open",        color: STATUS_COLORS.open },
  in_progress: { label: "In Progress", color: STATUS_COLORS.in_progress },
  resolved:    { label: "Resolved",    color: STATUS_COLORS.resolved },
  ignored:     { label: "Ignored",     color: STATUS_COLORS.ignored },
} satisfies ChartConfig

export function StatusDonut({ data }: { data: { status: string; count: number }[] }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: STATUS_LABELS[d.status] ?? d.status,
      value: d.count,
      status: d.status,
    }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[294px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
          {chartData.map((entry) => (
            <Cell
              key={entry.status}
              fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] ?? "#888"}
            />
          ))}
        </Pie>
        {/* @ts-expect-error recharts/shadcn type mismatch */}
        <ChartLegend content={(props) => <ChartLegendContent {...props} nameKey="status" />} />
      </PieChart>
    </ChartContainer>
  )
}
