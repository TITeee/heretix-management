"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { useMemo, useState } from "react"

export type AuditRow = {
  id: string
  userEmail: string | null
  action: string
  target: string | null
  detail: string | null
  createdAt: Date
}

const ACTION_LABELS: Record<string, string> = {
  login:                "Login",
  login_failed:         "Login Failed",
  user_created:         "User Created",
  user_updated:         "User Updated",
  user_deleted:         "User Deleted",
  user_password_reset:  "Password Reset",
  settings_updated:     "Settings Updated",
  asset_created:        "Asset Created",
  asset_imported:       "Asset Imported",
  asset_deleted:        "Asset Deleted",
  asset_scanned:        "Asset Scanned",
}

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value }))

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "createdAt",
    header: "Date / Time",
    cell: ({ row }) => (
      <span className="text-xs font-mono whitespace-nowrap" suppressHydrationWarning>
        {new Date(row.original.createdAt).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "userEmail",
    header: "User",
    cell: ({ row }) => <span className="text-sm">{row.original.userEmail ?? "n/a"}</span>,
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs">
        {ACTION_LABELS[row.original.action] ?? row.original.action}
      </Badge>
    ),
  },
  {
    accessorKey: "target",
    header: "Target",
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.target ?? "n/a"}</span>,
  },
  {
    accessorKey: "detail",
    header: "Detail",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.detail ?? "n/a"}</span>,
  },
]

export function AuditTable({ logs }: { logs: AuditRow[] }) {
  const [actionFilter, setActionFilter] = useState<Set<string>>(new Set())

  const filtered = useMemo(() =>
    actionFilter.size === 0 ? logs : logs.filter(l => actionFilter.has(l.action)),
    [logs, actionFilter]
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="Action"
          options={ACTION_OPTIONS}
          selected={actionFilter}
          onSelectedChange={setActionFilter}
        />
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        filterColumn="userEmail"
        filterPlaceholder="Filter by user..."
        initialPageSize={25}
        initialSorting={[{ id: "createdAt", desc: true }]}
      />
    </div>
  )
}
