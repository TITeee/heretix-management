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

/**
 * Ecosystems that name no package manager. A scanner lists a runtime it found as a binary
 * (Syft: node, python, php-cli, openjdk) as `pkg:generic`, a PEAR package as `pkg:pear`, and a
 * component with no purl comes in as "unknown". Nothing heretix-api holds is filed under such a
 * name, so a lookup is always empty, and loading data cannot change that. They are not sent,
 * and a scan reports them apart from the ecosystems that are only not loaded.
 */
export const UNSEARCHABLE_ECOSYSTEMS: ReadonlySet<string> = new Set(["generic", "pear", "unknown"])

export function isUnsearchableEcosystem(ecosystem: string): boolean {
  return UNSEARCHABLE_ECOSYSTEMS.has(ecosystem.trim().toLowerCase())
}

/** A stored list split in two: ecosystems with nothing loaded, and packages that cannot be looked up at all. */
export function splitNoData(list: NoDataEcosystem[]): { notLoaded: NoDataEcosystem[]; notSearchable: NoDataEcosystem[] } {
  return {
    notLoaded: list.filter((n) => !isUnsearchableEcosystem(n.ecosystem)),
    notSearchable: list.filter((n) => isUnsearchableEcosystem(n.ecosystem)),
  }
}
