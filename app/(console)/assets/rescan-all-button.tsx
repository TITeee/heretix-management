"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Run = {
  trigger: "schedule" | "manual"
  startedAt: string
  finishedAt: string | null
  done: number
  total: number
  failed: number
  error: string | null
}

type Status = { running: Run | null; last: Run | null }

const POLL_MS = 3000
// The toasts look like the Alerts page's Refresh Metadata.
const ERROR_STYLE = { background: "#e11d48", color: "#fff", border: "none" }
const SUCCESS_STYLE = { background: "#0d9488", color: "#fff", border: "none" }

/**
 * Rescan All on the Assets page: asks first, then scans every asset again in
 * the background (POST /api/assets/scan-all) and follows it, so the button
 * shows how far it is and the list reloads when it ends. A run already going,
 * started here, in another tab or by the daily schedule, is picked up too.
 */
export function RescanAllButton({ assetCount }: { assetCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState<Run | null>(null)
  // The run this page is following, so its end is announced once.
  const following = useRef<string | null>(null)

  const announce = useCallback((run: Run) => {
    if (run.error) {
      toast.error(`Rescan stopped: ${run.error}`, { style: ERROR_STYLE })
    } else if (run.failed > 0) {
      toast.error(`${run.total} assets rescanned. ${run.failed} could not be scanned.`, { style: ERROR_STYLE })
    } else {
      toast.success(`${run.total} asset${run.total !== 1 ? "s" : ""} rescanned.`, { style: SUCCESS_STYLE })
    }
    router.refresh()
  }, [router])

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/assets/scan-all")
      if (!res.ok) return
      const status = (await res.json()) as Status
      setRunning(status.running)
      if (status.running) {
        following.current ??= status.running.startedAt
      } else if (following.current && status.last?.startedAt === following.current) {
        following.current = null
        announce(status.last)
      }
    } catch {
      // A missed poll is retried by the next one.
    }
  }, [announce])

  // Pick up a run that is already going when the page opens.
  useEffect(() => {
    const first = setTimeout(() => { void poll() }, 0)
    return () => clearTimeout(first)
  }, [poll])

  // Follow it while it runs.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => { void poll() }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, poll])

  async function start() {
    setStarting(true)
    try {
      const res = await fetch("/api/assets/scan-all", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.error("A rescan of all assets is already running.", { style: ERROR_STYLE })
      } else if (!res.ok) {
        toast.error(data.error ?? "The rescan could not be started.", { style: ERROR_STYLE })
        return
      } else {
        // Follow this run from the start: a small one can end before the next poll.
        if (data.running?.startedAt) following.current = data.running.startedAt
        toast.success(`Rescanning ${assetCount} asset${assetCount !== 1 ? "s" : ""} in the background.`, { style: SUCCESS_STYLE })
      }
      setOpen(false)
      await poll()
    } catch {
      toast.error("The rescan could not be started.", { style: ERROR_STYLE })
    } finally {
      setStarting(false)
    }
  }

  const busy = running !== null
  const label = running
    ? running.total > 0 ? `Rescanning ${running.done}/${running.total}...` : "Rescanning..."
    : "Rescan All"

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy || assetCount === 0}
        title={assetCount === 0 ? "There are no assets to scan" : undefined}
      >
        <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rescan all {assetCount} asset{assetCount !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              Every asset is scanned again against heretix-api, one after another, in the background.
              New findings become alerts, and alerts that are no longer reported are handled as in the
              daily scan. This can take several minutes; you can leave this page meanwhile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={start} disabled={starting}>{starting ? "Starting..." : "Rescan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
