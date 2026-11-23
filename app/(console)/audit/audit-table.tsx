"use client"

import { useMemo, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import { X } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableDateRangeFilter } from "@/components/data-table/data-table-date-range-filter"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { auditActionLabel } from "@/lib/audit-actions"
import {
  auditQueryIsFiltered, auditQueryToSearchParams, boundToLocalDay, endOfLocalDay, startOfLocalDay, type AuditQuery,
} from "@/lib/audit-query"

export type AuditRow = {
  id: string
  userEmail: string | null
  action: string
  target: string | null
  detail: string | null
  createdAt: Date
}

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
        {auditActionLabel(row.original.action)}
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

const NEWEST_FIRST = [{ id: "createdAt", desc: true }]

/**
 * The audit log: one page the server fetched (lib/audit-list.ts), with the filters, the
 * searches and the page in the URL, so a view can be linked to and the back button works.
 */
export function AuditTable({ rows, total, page, query, actions }: {
  rows: AuditRow[]
  total: number
  /** The page the rows are of: the last one when the URL asked for one past the end. */
  page: number
  query: AuditQuery
  /** Every action the log holds. */
  actions: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function navigate(next: AuditQuery) {
    const search = auditQueryToSearchParams(next).toString()
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }))
  }

  // An action named in the URL is offered even if the log has none of it, so it can be unticked.
  const actionOptions = useMemo(
    () => [...new Set([...actions, ...query.actions])].map((value) => ({ value, label: auditActionLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [actions, query.actions]
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="Action"
          options={actionOptions}
          selected={new Set(query.actions)}
          onSelectedChange={(next) => navigate({ ...query, actions: [...next], page: 1 })}
        />
        <DataTableDateRangeFilter
          title="Date"
          from={query.from ? boundToLocalDay(query.from) : undefined}
          to={query.to ? boundToLocalDay(query.to) : undefined}
          onChange={({ from, to }) =>
            navigate({ ...query, from: from ? startOfLocalDay(from) : null, to: to ? endOfLocalDay(to) : null, page: 1 })}
        />
        {auditQueryIsFiltered(query) && (
          <Button variant="ghost" size="sm" onClick={() => navigate({ ...query, actions: [], user: null, q: null, from: null, to: null, page: 1 })}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {total.toLocaleString("en-US")} event{total !== 1 ? "s" : ""}
        </span>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="userEmail"
        filterPlaceholder="Filter by user..."
        secondFilterColumn="detail"
        secondFilterPlaceholder="Target / detail..."
        server={{
          rowCount: total,
          pageIndex: page - 1,
          pageSize: query.pageSize,
          sorting: NEWEST_FIRST,
          search: { first: query.user ?? "", second: query.q ?? "" },
          pending,
          onPageChange: (pageIndex) => navigate({ ...query, page: pageIndex + 1 }),
          onPageSizeChange: (pageSize) => navigate({ ...query, pageSize, page: 1 }),
          onSortingChange: () => {},
          onSearchChange: (which, value) => {
            const text = value.trim() || null
            navigate(which === "first" ? { ...query, user: text, page: 1 } : { ...query, q: text, page: 1 })
          },
        }}
      />
    </div>
  )
}
