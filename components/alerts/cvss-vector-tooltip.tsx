"use client"

import { Fragment } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { parseCvssVector, cvssVersionLabel, GROUP_ORDER } from "@/lib/cvss"

/**
 * Renders a CVSS vector string, decoding its abbreviations into a table on hover.
 */
export function CvssVectorTooltip({ vector }: { vector: string }) {
  // "X" means Not Defined: it carries no information, and leaving it in would
  // pad a full CVSS 4.0 vector's table out to 30+ rows.
  const allMetrics = parseCvssVector(vector)
  const metrics = allMetrics.filter((m) => m.value !== "X")
  const notDefinedCount = allMetrics.length - metrics.length

  if (metrics.length === 0) {
    return <span className="font-mono text-xs text-muted-foreground break-all">{vector}</span>
  }

  const groups = GROUP_ORDER
    .map((group) => ({ group, items: metrics.filter((m) => m.group === group) }))
    .filter((g) => g.items.length > 0)
  // A 3.x vector is usually Base-only, where a lone "Base" heading is just noise.
  const showGroupHeadings = groups.length > 1

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="font-mono text-xs text-muted-foreground break-all cursor-help underline decoration-dotted underline-offset-2">
              {vector}
            </span>
          }
        />
        <TooltipContent side="bottom" className="flex flex-col gap-1 w-96 max-w-none p-3 text-left">
          <p className="text-[10px] uppercase tracking-wide opacity-60">CVSS {cvssVersionLabel(vector)}</p>
          <table className="w-full text-xs">
            <tbody>
              {groups.map(({ group, items }) => (
                <Fragment key={group}>
                  {showGroupHeadings && (
                    <tr>
                      <td colSpan={3} className="pt-2 pb-0.5 text-[10px] uppercase tracking-wide opacity-60">
                        {group}
                      </td>
                    </tr>
                  )}
                  {items.map((m) => (
                    <tr key={m.key}>
                      <td className="pr-2 py-0.5 align-top font-mono whitespace-nowrap">
                        {m.key}:{m.value}
                      </td>
                      <td className="pr-2 py-0.5 align-top opacity-80">{m.label}</td>
                      <td className="py-0.5 align-top">{m.valueLabel}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {notDefinedCount > 0 && (
            <p className="mt-1 border-t border-background/20 pt-1.5 text-xs">
              {notDefinedCount} metric{notDefinedCount > 1 ? "s" : ""} not defined (X), omitted
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
