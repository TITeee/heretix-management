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

type PackageHistoryEntry = {
  id: string
  packageName: string
  ecosystem: string
  action: string
  oldVersion: string | null
  newVersion: string | null
  changedAt: Date
}

export function PackageHistoryModal({ entries }: { entries: PackageHistoryEntry[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <History className="h-3 w-3 mr-1" />
        Package History
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Package History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No history yet.</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between text-sm py-2 border-b last:border-0 gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-medium truncate">{entry.packageName}</div>
                    <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {entry.ecosystem} · {new Date(entry.changedAt).toLocaleString()}
                    </div>
                    {entry.action === "updated" && entry.oldVersion && entry.newVersion && (
                      <div className="text-xs text-muted-foreground">
                        {entry.oldVersion} → {entry.newVersion}
                      </div>
                    )}
                    {entry.action === "added" && entry.newVersion && (
                      <div className="text-xs text-muted-foreground">{entry.newVersion}</div>
                    )}
                    {entry.action === "removed" && entry.oldVersion && (
                      <div className="text-xs text-muted-foreground">{entry.oldVersion}</div>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      entry.action === "added"
                        ? "border-green-500 text-green-600 shrink-0"
                        : entry.action === "updated"
                        ? "border-blue-500 text-blue-600 shrink-0"
                        : "border-destructive text-destructive shrink-0"
                    }
                  >
                    {entry.action}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
