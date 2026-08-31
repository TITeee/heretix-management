"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { FileUp } from "lucide-react"
import { toast } from "sonner"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export function ImportVexButton({ assetId }: { assetId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const text = await file.text()
      const vex = JSON.parse(text)
      const res = await fetch(`/api/vex/import?assetId=${assetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vex),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? "Import failed.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
        return
      }
      // Without the follow-on detail, a document that matched nothing just reads
      // as "0 updated" with no clue why, which is the usual outcome for a vendor
      // VEX built on version ranges.
      const detail: string[] = []
      if (result.unsupportedRange > 0) {
        detail.push(`${result.unsupportedRange} version range${result.unsupportedRange !== 1 ? "s" : ""} not supported`)
      }
      if (result.notFound > 0) detail.push(`${result.notFound} not matched to any alert`)
      if (result.skipped > 0) detail.push(`${result.skipped} skipped`)

      const summary = `VEX imported: ${result.applied} alert${result.applied !== 1 ? "s" : ""} updated.`
      const message = detail.length > 0 ? `${summary} (${detail.join(", ")})` : summary
      const noEffect = result.applied === 0

      toast[noEffect ? "warning" : "success"](message, {
        style: noEffect
          ? { background: "#d97706", color: "#fff", border: "none" }
          : { background: "#0d9488", color: "#fff", border: "none" },
      })
      router.refresh()
    } catch {
      toast.error("Invalid VEX file.", { style: { background: "#e11d48", color: "#fff", border: "none" } })
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <FileUp className="h-4 w-4" />
        Import VEX
      </button>
    </>
  )
}
