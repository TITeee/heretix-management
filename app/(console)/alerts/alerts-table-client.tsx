"use client"

import React, { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefreshCw, Activity, FileDown, FileUp } from "lucide-react"
import { toast } from "sonner"
import { AlertsTable } from "./alerts-table"
import type { Alert } from "./alerts-table"

export function AlertsTableClient({ data, initialPackageName, initialAssetId, slaEnabled }: { data: Alert[]; initialPackageName?: string; initialAssetId?: string; slaEnabled?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  async function handleVexImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const text = await file.text()
      const vex = JSON.parse(text)
      const res = await fetch("/api/vex/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vex),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? "Import failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
        return
      }
      toast.success(`VEX imported: ${result.applied} alert${result.applied !== 1 ? "s" : ""} updated.`, { style: { background: "#0d9488", color: "#fff", border: "none" } })
      router.refresh()
    } catch {
      toast.error("Invalid VEX file.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
    }
  }

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

  const hasVex = data.some(a => a.status === "ignored" && a.vexJustification)
  const vexUrl = `/api/vex?download=true${initialAssetId ? `&assetId=${initialAssetId}` : ""}`

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
        <a
          href={hasVex ? vexUrl : undefined}
          aria-disabled={!hasVex}
          className={`inline-flex h-8 items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm font-medium shadow-sm ${hasVex ? "hover:bg-accent" : "opacity-40 pointer-events-none"}`}
        >
          <FileDown className="h-4 w-4" />
          Export VEX
        </a>
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleVexImport} />
        <button
          onClick={() => importRef.current?.click()}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <FileUp className="h-4 w-4" />
          Import VEX
        </button>
      </div>
      <AlertsTable data={data} initialPackageName={initialPackageName} initialAssetId={initialAssetId} slaEnabled={slaEnabled} />
    </div>
  )
}
