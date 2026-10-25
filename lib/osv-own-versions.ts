/**
 * The "Specific Affected Versions" of the OSV tab, narrowed to the alert's own entry.
 *
 * One OSV record can cover several releases of a distribution (DEBIAN-CVE-2026-19931 lists
 * Debian 12, 13 and 14, with 184, 84 and 68 versions), and the tab used to merge them into one
 * list, so nothing said which of them the alert was matched on. heretix-api tries the entry's
 * enumerated versions first and its introduced/fixed range second, so the tab shows the alert's
 * entry's versions, marks the alert's own version, and says when it was the range that matched.
 */
export type OsvAffectedEntry = { package?: { ecosystem?: string; name?: string }; versions?: string[] }

export type OsvVersionAlert = {
  ecosystem: string
  packageName: string
  sourcePackage?: string | null
  /** The installed version of packageName. */
  version?: string | null
}

export type OwnVersions = {
  /** Versions of the alert's own entries, the alert's own first. */
  versions: string[]
  /** The alert's version is among them. */
  hasOwnVersion: boolean
}

function isOwnEntry(entry: OsvAffectedEntry, alert: OsvVersionAlert): boolean {
  const pkg = entry.package
  if (!pkg || pkg.ecosystem !== alert.ecosystem) return false
  return pkg.name === alert.packageName || (!!alert.sourcePackage && pkg.name === alert.sourcePackage)
}

/** Null when the record has no entry of the alert's ecosystem and package: the caller then lists every version. */
export function ownVersions(affected: OsvAffectedEntry[] | undefined, alert: OsvVersionAlert | null | undefined): OwnVersions | null {
  if (!alert || !affected) return null
  const own = affected.filter((entry) => isOwnEntry(entry, alert))
  if (own.length === 0) return null
  const all = [...new Set(own.flatMap((entry) => entry.versions ?? []))]
  const hasOwnVersion = !!alert.version && all.includes(alert.version)
  const versions = hasOwnVersion ? [alert.version as string, ...all.filter((v) => v !== alert.version)] : all
  return { versions, hasOwnVersion }
}

type OsvRange = { introducedVersion: string | null; fixedVersion: string | null; lastAffectedVersion: string | null }

/**
 * An entry's affected range as the Affected Packages table shows it. OSV's introduced "0" means
 * "from the first version", not a lower bound of zero, so it is left out: "≥ 0" read as a
 * condition that excludes something, and made almost every row look like a false positive.
 * OSV's "fixed" is an exclusive upper bound; "last_affected" is inclusive and means no fix is known.
 */
export function osvRangeLabel(range: OsvRange): string {
  const lower = range.introducedVersion && range.introducedVersion !== "0" ? `≥ ${range.introducedVersion}` : null
  const upper = range.fixedVersion
    ? `< ${range.fixedVersion}`
    : range.lastAffectedVersion
    ? `≤ ${range.lastAffectedVersion}`
    : null
  const label = [lower, upper].filter(Boolean).join(", ")
  if (label) return label
  return range.introducedVersion === "0" ? "All versions" : "n/a"
}
