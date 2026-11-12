/**
 * Helpers for the "Used by" of a package (Package.usedBy): the systemd units, or the
 * commands of processes outside a unit, that had the package loaded when heretix-cli
 * collected the asset.
 */

/**
 * The first `max` names to show in a table cell, and how many more there are. A basic
 * library such as libc6 is loaded by dozens of units, so a cell shows a few and the
 * rest goes in its tooltip.
 */
export function summarizeUsedBy(usedBy: string[] | undefined, max = 2): { shown: string[]; more: number } {
  const all = usedBy ?? []
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}

/**
 * Whether the packages table's search box matches a package: by its name, or by a
 * service that uses it ("nginx" finds the packages nginx.service has loaded). Case
 * does not matter; an empty query matches everything.
 */
export function packageMatchesSearch(p: { name: string; usedBy?: string[] }, query: string): boolean {
  const q = query.toLowerCase()
  if (q === "") return true
  return p.name.toLowerCase().includes(q) || (p.usedBy ?? []).some((u) => u.toLowerCase().includes(q))
}

/** Every distinct name that uses some package, sorted: the options of the Used by filter. */
export function usedByOptions(packages: { usedBy?: string[] }[]): string[] {
  return [...new Set(packages.flatMap((p) => p.usedBy ?? []))].sort((a, b) => a.localeCompare(b))
}
