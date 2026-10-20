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
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  exportRef?: React.MutableRefObject<(() => TData[]) | undefined>
  /**
   * Server mode: `data` is one page the parent fetched, and paging, sorting
   * and the two search boxes are the parent's state (the URL, typically).
   * The table only reports what the user asks for. Without it the table
   * pages, sorts and searches `data` itself, as before.
   */
  server?: ServerTableState
}

export type ServerTableState = {
  /** Rows in the whole list, across pages. */
  rowCount: number
  pageIndex: number
  pageSize: number
  sorting: SortingState
  /** The search boxes' values (filterColumn's, secondFilterColumn's). */
  search: { first: string; second: string }
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  onSortingChange: (sorting: SortingState) => void
  /** Called once typing pauses, not on every key. */
  onSearchChange: (which: "first" | "second", value: string) => void
  /** A request for new rows is in flight. */
  pending?: boolean
}

const SEARCH_DEBOUNCE_MS = 300

/** A search box's value, typed locally and handed on once typing pauses. */
function useDebouncedSearch(value: string, onChange: ((v: string) => void) | undefined): [string, (v: string) => void] {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  // A new value from the parent (Reset, a link) replaces what is typed.
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  useEffect(() => {
    if (!onChange || text === value) return
    const timer = setTimeout(() => onChange(text), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  return [text, setText]
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
  initialPageSize = 10,
  exportRef,
  server,
}: DataTableProps<TData, TValue>) {
  const [localSorting, setSorting] = useState<SortingState>(initialSorting)
  const sorting = server ? server.sorting : localSorting
  const [firstSearch, setFirstSearch] = useDebouncedSearch(server?.search.first ?? "", server ? (v) => server.onSearchChange("first", v) : undefined)
  const [secondSearch, setSecondSearch] = useDebouncedSearch(server?.search.second ?? "", server ? (v) => server.onSearchChange("second", v) : undefined)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    filterColumn && initialFilterValue ? [{ id: filterColumn, value: initialFilterValue }] : []
  )
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pageSize] = useState(initialPageSize)

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
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: !!enableRowSelection,
    autoResetPageIndex: false,
    ...(server
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          rowCount: server.rowCount,
          onSortingChange: (updater) => server.onSortingChange(typeof updater === "function" ? updater(server.sorting) : updater),
          onPaginationChange: (updater) => {
            const current = { pageIndex: server.pageIndex, pageSize: server.pageSize }
            const next = typeof updater === "function" ? updater(current) : updater
            if (next.pageSize !== current.pageSize) server.onPageSizeChange(next.pageSize)
            else if (next.pageIndex !== current.pageIndex) server.onPageChange(next.pageIndex)
          },
          state: {
            sorting,
            columnVisibility,
            rowSelection,
            pagination: { pageIndex: server.pageIndex, pageSize: server.pageSize },
          },
        }
      : {
          onSortingChange: setSorting,
          onColumnFiltersChange: setColumnFilters,
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
          state: { sorting, columnFilters, columnVisibility, rowSelection },
        }),
  })

  if (exportRef) {
    exportRef.current = () => table.getFilteredRowModel().rows.map((r) => r.original)
  }

  // Back to the first page when the filters change. Most pages filter outside the table (facet
  // buttons) and hand it the narrowed data, so columnFilters alone does not see that; a change in
  // the number of rows does, and with the same number of rows the page count is the same too, so
  // the current page can never end up past the last one. In server mode the parent owns the page.
  useEffect(() => {
    if (!server) table.setPageIndex(0)
  }, [columnFilters, data.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // A selection is of the rows on screen; a new page or filter starts without one.
  useEffect(() => {
    if (server) setRowSelection({})
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalRows = server ? server.rowCount : table.getFilteredRowModel().rows.length

  useEffect(() => {
    if (!onRowSelectionChange) return
    const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original)
    onRowSelectionChange(selectedRows)
  }, [rowSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {filterColumn && server && (
          <div className="flex items-center gap-1 max-w-sm w-full">
            <Input
              placeholder={filterPlaceholder}
              value={firstSearch}
              onChange={(e) => setFirstSearch(e.target.value)}
              className="flex-1"
            />
            {firstSearch && (
              <button
                type="button"
                onClick={() => {
                  setFirstSearch("")
                  server.onSearchChange("first", "")
                  onFilterReset?.()
                }}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        )}
        {secondFilterColumn && server && (
          <div className="flex items-center gap-1">
            <Input
              placeholder={secondFilterPlaceholder}
              value={secondSearch}
              onChange={(e) => setSecondSearch(e.target.value)}
              className="w-40"
            />
            {secondSearch && (
              <button
                type="button"
                onClick={() => {
                  setSecondSearch("")
                  server.onSearchChange("second", "")
                }}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        )}
        {filterColumn && !server && (
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
        {secondFilterColumn && !server && (
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
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => { if (v) table.setPageSize(Number(v)) }}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 15, 25, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
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
      <div className={cn("rounded-md border overflow-x-auto transition-opacity", server?.pending && "opacity-60")} aria-busy={server?.pending || undefined}>
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
          {totalRows.toLocaleString("en-US")} row(s) total
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
