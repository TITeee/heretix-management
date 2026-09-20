"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DeleteAssetDialog } from "@/components/assets/delete-asset-dialog"
import { Trash2 } from "lucide-react"

export function DeleteAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter()
  return (
    // The asset itself is gone after this, so refreshing this page would
    // 404 — send the user back to the list instead.
    <DeleteAssetDialog assetId={assetId} assetName={assetName} onDeleted={() => router.push("/assets")}>
      {(open) => (
        <Button variant="outline" size="sm" onClick={open}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
    </DeleteAssetDialog>
  )
}
