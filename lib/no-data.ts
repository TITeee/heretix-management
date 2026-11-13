import type { NoDataEcosystem } from "@/lib/heretix-api"

/** Adds the ecosystems of one batch to the running total of a scan (a scan sends several batches). */
export function mergeNoData(total: Map<string, number>, batch: NoDataEcosystem[]): void {
  for (const { ecosystem, packages } of batch) total.set(ecosystem, (total.get(ecosystem) ?? 0) + packages)
}

/** The total as stored on a scan: most packages first, null when there is nothing to say. */
export function noDataList(total: Map<string, number>): NoDataEcosystem[] | null {
  if (total.size === 0) return null
  return [...total].map(([ecosystem, packages]) => ({ ecosystem, packages }))
    .sort((a, b) => b.packages - a.packages || a.ecosystem.localeCompare(b.ecosystem))
}

/** A stored value read back, whatever it holds: only well-formed entries are kept. */
export function parseNoData(value: unknown): NoDataEcosystem[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is NoDataEcosystem => !!v && typeof v.ecosystem === "string" && typeof v.packages === "number",
  )
}
