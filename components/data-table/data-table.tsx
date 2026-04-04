"use client"

import React, { useEffect, useState } from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, ChevronLeft, ChevronRight, CheckIcon, MinusIcon, ChevronsLeft, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterColumn?: string
  filterPlaceholder?: string
  initialFilterValue?: string
  onFilterReset?: () => void
  secondFilterColumn?: string
  secondFilterPlaceholder?: string
  onRowClick?: (row: TData) => void
  headerActions?: React.ReactNode
  enableRowSelection?: boolean
  getRowId?: (row: TData) => string
  onRowSelectionChange?: (rows: TData[]) => void
  initialSorting?: SortingState
  initialColumnVisibility?: VisibilityState
  initialPageSize?: number
}

function CheckboxCell({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      className={cn(
        "size-4 shrink-0 rounded-sm border border-primary flex items-center justify-center cursor-pointer",
        checked || indeterminate ? "bg-primary text-primary-foreground" : "bg-background"
      )}
      onClick={() => onChange(!checked)}
    >
      {indeterminate ? (
        <MinusIcon className="size-3" />
      ) : checked ? (
        <CheckIcon className="size-3" />
      ) : null}
    </div>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = "Search...",
  initialFilterValue,
  onFilterReset,
  secondFilterColumn,
  secondFilterPlaceholder = "Search...",
  onRowClick,
  headerActions,
  enableRowSelection,
  getRowId,
  onRowSelectionChange,
  initialSorting = [],
  initialColumnVisibility = {},
  initialPageSize = 25,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    filterColumn && initialFilterValue ? [{ id: filterColumn, value: initialFilterValue }] : []
  )
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pageSize] = useState(initialPageSize)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectionColumn: ColumnDef<TData, any> = {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center px-1">
        <CheckboxCell
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(v) => table.toggleAllPageRowsSelected(v)}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div
        className="flex items-center justify-center px-1"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckboxCell
          checked={row.getIsSelected()}
          onChange={(v) => row.toggleSelected(v)}
        />
      </div>
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  }

  const resolvedColumns = enableRowSelection
    ? [selectionColumn, ...columns]
    : columns

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: !!enableRowSelection,
    initialState: { pagination: { pageSize } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  })

  useEffect(() => {
    if (!onRowSelectionChange) return
    const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original)
    onRowSelectionChange(selectedRows)
  }, [rowSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {filterColumn && (
          <div className="flex items-center gap-1 max-w-sm w-full">
            <Input
              placeholder={filterPlaceholder}
              value={
                (table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""
              }
              onChange={(e) =>
                table.getColumn(filterColumn)?.setFilterValue(e.target.value)
              }
              className="flex-1"
            />
            {(table.getColumn(filterColumn)?.getFilterValue() as string) && (
              <button
                type="button"
                onClick={() => {
                  table.getColumn(filterColumn)?.setFilterValue("")
                  onFilterReset?.()
                }}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        )}
        {secondFilterColumn && (
          <div className="flex items-center gap-1">
            <Input
              placeholder={secondFilterPlaceholder}
              value={
                (table.getColumn(secondFilterColumn)?.getFilterValue() as string) ?? ""
              }
              onChange={(e) =>
                table.getColumn(secondFilterColumn)?.setFilterValue(e.target.value)
              }
              className="w-40"
            />
            {(table.getColumn(secondFilterColumn)?.getFilterValue() as string) && (
              <button
                type="button"
                onClick={() => table.getColumn(secondFilterColumn)?.setFilterValue("")}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {headerActions}
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50].map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-transparent px-3 text-sm font-medium shadow-sm hover:bg-accent">
              Columns <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="capitalize"
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  >
                    {col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={(e) => {
                    if (!onRowClick) return
                    const target = e.target as HTMLElement
                    if (target.closest(
                      'button, input, textarea, a, [role="option"], [data-slot="select-item"], [data-slot="select-content"], [data-slot="dialog-content"]'
                    )) return
                    onRowClick(row.original)
                  }}
                  className={onRowClick ? "cursor-pointer" : ""}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={resolvedColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} row(s) total
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
