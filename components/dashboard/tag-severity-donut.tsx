"use client"

import { PieChart, Pie, Cell, Label } from "recharts"
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
  Critical: { label: "Critical", color: SEVERITY_COLORS.critical },
  High:     { label: "High",     color: SEVERITY_COLORS.high },
  Medium:   { label: "Medium",   color: SEVERITY_COLORS.medium },
  Low:      { label: "Low",      color: SEVERITY_COLORS.low },
  "N/A":    { label: "N/A",      color: SEVERITY_COLORS.na },
} satisfies ChartConfig

const FILL: Record<string, string> = {
  Critical: SEVERITY_COLORS.critical,
  High:     SEVERITY_COLORS.high,
  Medium:   SEVERITY_COLORS.medium,
  Low:      SEVERITY_COLORS.low,
  "N/A":    SEVERITY_COLORS.na,
}

export function TagSeverityDonut({
  critical, high, medium, low, na,
}: {
  critical: number; high: number; medium: number; low: number; na: number
}) {
  const total = critical + high + medium + low + na

  const data = [
    { name: "Critical", value: critical },
    { name: "High",     value: high },
    { name: "Medium",   value: medium },
    { name: "Low",      value: low },
    { name: "N/A",      value: na },
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[280px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} cx="50%" cy="50%" innerRadius={65} outerRadius={90} dataKey="value">
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 8}
                      className="fill-foreground"
                      style={{ fontSize: "2rem", fontWeight: "bold" }}
                    >
                      {total}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 14}
                      className="fill-muted-foreground"
                      style={{ fontSize: "0.875rem" }}
                    >
                      alerts
                    </tspan>
                  </text>
                )
              }
            }}
          />
          {data.map((entry) => (
            <Cell key={entry.name} fill={FILL[entry.name]} />
          ))}
        </Pie>
        {/* @ts-expect-error recharts/shadcn type mismatch */}
        <ChartLegend content={(props) => <ChartLegendContent {...props} />} />
      </PieChart>
    </ChartContainer>
  )
}
