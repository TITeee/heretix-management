"use client"

import React from "react"
import { AlertsTable } from "./alerts-table"
import type { Alert } from "./alerts-table"
import { AlertsMoreMenu } from "./alerts-more-menu"

export function AlertsTableClient({ data, initialPackageName, initialAssetId, slaEnabled }: { data: Alert[]; initialPackageName?: string; initialAssetId?: string; slaEnabled?: boolean }) {
  // Mirrors the exporter: accepted_risk stays internal, so it does not enable the button.
  const hasVex = data.some(
    a => a.status === "ignored" && (a.ignoreReason === "false_positive" || a.vexJustification)
  )

  return (
    <div className="space-y-4">
      <AlertsMoreMenu hasVex={hasVex} vexAssetId={initialAssetId} />
      <AlertsTable data={data} initialPackageName={initialPackageName} initialAssetId={initialAssetId} slaEnabled={slaEnabled} />
    </div>
  )
}
