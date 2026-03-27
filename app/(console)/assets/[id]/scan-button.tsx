"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScanLine } from "lucide-react"
import { toast } from "sonner"

export function ScanButton({ assetId }: { assetId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleScan() {
    setLoading(true)
    try {
      const res = await fetch(`/api/assets/${assetId}/scan`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
        return
      }
      toast.success(`Scan complete. ${data.newAlerts} new alert${data.newAlerts !== 1 ? "s" : ""} detected.`, { style: { background: "#0d9488", color: "#fff", border: "none" } })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" onClick={handleScan} disabled={loading}>
      <ScanLine className="mr-1 h-4 w-4" />
      {loading ? "Scanning..." : "Run Scan"}
    </Button>
  )
}
