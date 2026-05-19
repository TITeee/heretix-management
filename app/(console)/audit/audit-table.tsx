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

const ACTION_COLORS: Record<string, string> = {
  login:                "bg-green-600",
  login_failed:         "bg-red-600",
  user_created:         "bg-blue-600",
  user_updated:         "bg-blue-400",
  user_deleted:         "bg-red-500",
  user_password_reset:  "bg-orange-500",
  settings_updated:     "bg-purple-600",
  asset_created:        "bg-teal-600",
  asset_imported:       "bg-teal-500",
  asset_deleted:        "bg-red-400",
  asset_scanned:        "bg-gray-500",
}

const ACTION_OPTIONS = Object.keys(ACTION_COLORS).map(a => ({ label: a, value: a }))

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
    cell: ({ row }) => <span className="text-sm">{row.original.userEmail ?? "—"}</span>,
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <Badge className={`${ACTION_COLORS[row.original.action] ?? "bg-gray-600"} text-white text-xs`}>
        {row.original.action}
      </Badge>
    ),
  },
  {
    accessorKey: "target",
    header: "Target",
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.target ?? "—"}</span>,
  },
  {
    accessorKey: "detail",
    header: "Detail",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.detail ?? "—"}</span>,
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
