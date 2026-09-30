/**
 * The distro part of an OS ecosystem string: "Red Hat:9" → "Red Hat",
 * "Ubuntu:22.04:LTS" → "Ubuntu", "Debian:12" → "Debian".
 */
export function distroName(ecosystem: string): string {
  return ecosystem.split(":")[0].trim()
}

// Each distro's ratings, least to most severe. Scales are never compared
// across distros: a sort groups by distro and orders only within one.
// Values that aren't a severity (Debian "end-of-life", "not yet assigned")
// are deliberately absent.
const DISTRO_PRIORITY_SCALES: Record<string, string[]> = {
  "Ubuntu": ["negligible", "low", "medium", "high", "critical"],
  "Debian": ["unimportant", "low", "medium", "high"],
  "Red Hat": ["low", "moderate", "important", "critical"],
}

/**
 * Sort key: the distro, then the rating's rank on that distro's own scale,
 * so a sorted list groups by distro and orders by severity within each.
 * undefined for no rating or one that isn't a severity, which a table keeps
 * last in either direction.
 */
export function distroPrioritySortKey(ecosystem: string, distroPriority: string | null | undefined): string | undefined {
  if (!distroPriority) return undefined
  const distro = distroName(ecosystem)
  const rank = DISTRO_PRIORITY_SCALES[distro]?.indexOf(distroPriority.toLowerCase()) ?? -1
  if (rank < 0) return undefined
  return `${distro}\u0000${rank}`
}

/**
 * The distro rating(s) an OSV record carries, for display. Ubuntu rates once
 * per record; Debian rates per affected release, and releases can differ, so
 * those are listed per release ("Debian 12: low") unless they all agree.
 * Empty when the record has none.
 */
export function osvDistroRatings(osv: {
  distroPriority?: string | null
  affectedPackages?: { ecosystem: string; distroPriority?: string | null }[]
}): string[] {
  if (osv.distroPriority) return [osv.distroPriority]
  const byRelease = new Map<string, string>()
  for (const p of osv.affectedPackages ?? []) {
    if (p.distroPriority) byRelease.set(p.ecosystem.replace(/:/g, " "), p.distroPriority)
  }
  const values = new Set(byRelease.values())
  if (values.size <= 1) return [...values]
  return [...byRelease].sort(([a], [b]) => a.localeCompare(b)).map(([release, value]) => `${release}: ${value}`)
}

/**
 * "Red Hat: low", naming the distro because each one rates on its own scale
 * (Red Hat "moderate" and Ubuntu "medium" are not the same judgement).
 * null when the alert has no distro rating.
 */
export function distroPriorityLabel(ecosystem: string, distroPriority: string | null | undefined): string | null {
  if (!distroPriority) return null
  return `${distroName(ecosystem)}: ${distroPriority}`
}
