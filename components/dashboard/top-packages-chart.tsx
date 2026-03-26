"use client"

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { STATUS_COLORS } from "@/lib/severity"

const chartConfig = {
  count: {
    label: "Open Alerts",
    color: STATUS_COLORS.open,
  },
} satisfies ChartConfig

export function TopPackagesChart({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  const height = Math.max(100, data.length * 36 + 16)

  return (
    <ChartContainer
      config={chartConfig}
      className="w-full"
      style={{ height }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ right: 40, left: 0, top: 4, bottom: 4 }}
      >
        <YAxis dataKey="name" type="category" hide />
        <XAxis dataKey="count" type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="count" layout="vertical" fill="var(--color-count)" radius={4}>
          <LabelList
            dataKey="name"
            position="insideLeft"
            offset={8}
            className="fill-white"
            fontSize={11}
            formatter={(v: string) => (v.length > 28 ? v.slice(0, 27) + "…" : v)}
          />
          <LabelList
            dataKey="count"
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
