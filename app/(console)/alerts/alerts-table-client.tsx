"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefreshCw, Activity } from "lucide-react"
import { toast } from "sonner"
import { AlertsTable } from "./alerts-table"
import type { Alert } from "./alerts-table"

export function AlertsTableClient({ data, initialPackageName }: { data: Alert[]; initialPackageName?: string }) {
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
      toast.success(`${data.updated} alert${data.updated !== 1 ? "s" : ""} updated.`, { style: { background: "#0d9488", color: "#fff", border: "none" } })
      router.refresh()
    } catch {
      toast.error("Update failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Updating..." : "Refresh Metadata"}
        </button>
        <Link
          href="/alerts/activity"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Activity className="h-4 w-4" />
          Activity
        </Link>
      </div>
      <AlertsTable data={data} initialPackageName={initialPackageName} />
    </div>
  )
}
