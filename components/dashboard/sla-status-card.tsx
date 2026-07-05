"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Zap, Clock, CheckCircle } from "lucide-react"

export function SlaStatusCard({ overdue, urgent, warning, ok }: { overdue: number; urgent: number; warning: number; ok: number }) {
  const total = overdue + urgent + warning + ok

  if (total === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">SLA Status</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-muted-foreground">-</div>
          <p className="text-xs text-muted-foreground mt-1">No open alerts</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">SLA Status</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {overdue > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-600 font-medium">Overdue</span>
              </span>
              <span className="font-mono font-bold text-red-600">{overdue}</span>
            </div>
          )}
          {urgent > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-600" />
                <span className="text-orange-600 font-medium">Urgent</span>
              </span>
              <span className="font-mono font-bold text-orange-600">{urgent}</span>
            </div>
          )}
          {warning > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-yellow-600 font-medium">Warning</span>
              </span>
              <span className="font-mono font-bold text-yellow-600">{warning}</span>
            </div>
          )}
          {ok > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-600 font-medium">OK</span>
              </span>
              <span className="font-mono font-bold text-green-600">{ok}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
