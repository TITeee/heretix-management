"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

// Shared by the Assets table row action and the asset detail page's header
// button — only the trigger's appearance and what happens after a successful
// delete (refresh a list vs. navigate away from the now-gone detail page)
// differ between the two.
export function DeleteAssetDialog({
  assetId,
  assetName,
  onDeleted,
  children,
}: {
  assetId: string
  assetName: string
  onDeleted: () => void
  children: (openDialog: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/assets/${assetId}`, { method: "DELETE" })
      setOpen(false)
      onDeleted()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children(() => setOpen(true))}
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete Asset</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{assetName}</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
