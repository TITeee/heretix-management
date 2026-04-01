"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { History } from "lucide-react"

type ScanJob = {
  id: string
  status: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  newAlerts: number
  errorMsg: string | null
}

export function ScanHistoryModal({ scanJobs }: { scanJobs: ScanJob[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <History className="h-3 w-3 mr-1" />
        Scan History
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {scanJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No scans yet.</p>
            ) : (
              scanJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground" suppressHydrationWarning>
                      {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.errorMsg && (
                      <div className="text-xs text-destructive">{job.errorMsg}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {job.newAlerts > 0 && (
                      <span className="text-xs text-destructive">+{job.newAlerts} alerts</span>
                    )}
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "outline"
                          : job.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
