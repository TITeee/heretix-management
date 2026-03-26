"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { assetColumns, type AssetRow } from "@/components/assets/columns"

const TYPE_OPTIONS = [
  { value: "host",         label: "Host" },
  { value: "docker_image", label: "Docker Image" },
]

export function AssetsTable({ data }: { data: AssetRow[] }) {
  const router = useRouter()
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())

  const tagOptions = useMemo(() =>
    [...new Map(data.flatMap(a => a.tags).map(t => [t.id, t])).values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ value: t.id, label: t.name })),
    [data]
  )

  const filteredData = useMemo(() =>
    data.filter(a => {
      if (typeFilter.size > 0 && !typeFilter.has(a.assetType)) return false
      if (tagFilter.size > 0 && !a.tags.some(t => tagFilter.has(t.id))) return false
      return true
    }),
    [data, typeFilter, tagFilter]
  )

  const hasFilter = typeFilter.size > 0 || tagFilter.size > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DataTableFacetedFilter
          title="Type"
          options={TYPE_OPTIONS}
          selected={typeFilter}
          onSelectedChange={setTypeFilter}
        />
        <DataTableFacetedFilter
          title="Tags"
          options={tagOptions}
          selected={tagFilter}
          onSelectedChange={setTagFilter}
        />
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(new Set()); setTagFilter(new Set()) }}>
            Reset <X className="ml-1 size-4" />
          </Button>
        )}
      </div>
      <DataTable
        columns={assetColumns}
        data={filteredData}
        filterColumn="name"
        filterPlaceholder="Search by name or hostname..."
        onRowClick={(row) => router.push(`/assets/${row.id}`)}
      />
    </div>
  )
}
