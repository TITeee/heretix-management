"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefreshCw, Activity, FileDown, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { AlertsTable } from "./alerts-table"
import type { Alert } from "./alerts-table"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export function AlertsTableClient({ data, initialPackageName, initialAssetId, slaEnabled }: { data: Alert[]; initialPackageName?: string; initialAssetId?: string; slaEnabled?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    try {
      const res = await fetch("/api/alerts/refresh", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Update failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
        return
      }
      const updated = `${data.updated} alert${data.updated !== 1 ? "s" : ""} updated`
      if (data.failed > 0) {
        // Reporting only the successes would make an unreachable heretix-api look
        // like a run that found nothing to change.
        toast.error(
          `${updated}. ${data.failed} vulnerabilit${data.failed !== 1 ? "ies" : "y"} could not be reached.`,
          { style: { background: "#e11d48", color: "#fff", border: "none" } }
        )
      } else {
        toast.success(`${updated}.`, { style: { background: "#0d9488", color: "#fff", border: "none" } })
      }
      router.refresh()
    } catch {
      toast.error("Update failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
    } finally {
      setLoading(false)
    }
  }

  // Mirrors the exporter: accepted_risk stays internal, so it does not enable the button.
  const hasVex = data.some(
    a => a.status === "ignored" && (a.ignoreReason === "false_positive" || a.vexJustification)
  )
  const vexUrl = `/api/vex?download=true${initialAssetId ? `&assetId=${initialAssetId}` : ""}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {/* These are occasional/administrative actions (metadata refresh runs
            on a daily cron anyway), not part of the core triage workflow —
            tucked into one menu instead of three standing buttons. */}
        <div className="relative group">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <MoreHorizontal className="h-4 w-4" />
            More
          </button>
          <div className="absolute left-0 top-full z-10 mt-1 hidden group-focus-within:flex group-hover:flex flex-col rounded-md border bg-popover shadow-md min-w-40">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-left hover:bg-accent rounded-t-md disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Updating..." : "Refresh Metadata"}
            </button>
            <Link href="/alerts/activity" className="flex items-center gap-1.5 px-3 py-2 text-sm text-left hover:bg-accent">
              <Activity className="h-4 w-4" />
              Activity
            </Link>
            <a
              {...(hasVex ? { href: vexUrl } : {})}
              aria-disabled={!hasVex}
              title={!hasVex ? "No ignored alerts with an exportable reason yet" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm text-left hover:bg-accent rounded-b-md",
                !hasVex && "pointer-events-none opacity-50"
              )}
            >
              <FileDown className="h-4 w-4" />
              Export VEX
            </a>
          </div>
        </div>
      </div>
      <AlertsTable data={data} initialPackageName={initialPackageName} initialAssetId={initialAssetId} slaEnabled={slaEnabled} />
    </div>
  )
}
