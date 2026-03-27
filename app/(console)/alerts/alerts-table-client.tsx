"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCw, History } from "lucide-react"
import { toast } from "sonner"
import { AlertsTable } from "./alerts-table"
import { RefreshLogSheet } from "./refresh-log-sheet"
import type { Alert } from "./alerts-table"

export function AlertsTableClient({ data, initialPackageName }: { data: Alert[]; initialPackageName?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

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
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Updating..." : "Refresh Metadata"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4 mr-1" />
          View History
        </Button>
      </div>
      <RefreshLogSheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <AlertsTable data={data} initialPackageName={initialPackageName} />
    </div>
  )
}
