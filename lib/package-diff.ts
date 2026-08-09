/**
 * Diffing an incoming inventory against the packages already stored for an asset.
 *
 * Packages are matched on (name, ecosystem, version). Version has to be part of
 * the key: npm and pnpm resolve several versions of the same package side by
 * side (a single asset here carries 218 such groups), so matching on name alone
 * collapses those rows against each other, losing whichever lost the collision
 * and reporting spurious version changes for the rest.
 */

export type DiffPackage = {
  name: string
  version: string
  ecosystem: string
}

export type PackageDiff<E extends DiffPackage, I extends DiffPackage> = {
  toCreate: I[]
  /** Existing row paired with the incoming row that replaces its contents. */
  toUpdateMeta: { existing: E; incoming: I }[]
  toDelete: E[]
  /**
   * Versions that are no longer installed even though the package itself is still
   * present at some other version — an upgrade rather than a removal. Alerts raised
   * against these move to the successor so the finding keeps its history; a package
   * that disappeared outright is left alone because a partial inventory should not
   * silently close its findings.
   */
  supersededVersions: {
    name: string
    ecosystem: string
    version: string
    remainingVersions: string[]
    /**
     * The version the alerts move to, or null when several versions of the package
     * remain and no single one can be called the successor (npm and pnpm resolve
     * versions side by side, and they can all move at once). Alerts of an ambiguous
     * supersession stay where they are: guessing a successor would attach a finding
     * to a version nothing has verified it against.
     */
    successor: string | null
  }[]
}

function key(p: DiffPackage): string {
  return `${p.name}::${p.ecosystem}::${p.version}`
}

function groupKey(p: DiffPackage): string {
  return `${p.name}::${p.ecosystem}`
}

export function diffPackages<E extends DiffPackage, I extends DiffPackage>(
  existing: E[],
  incoming: I[]
): PackageDiff<E, I> {
  const existingByKey = new Map(existing.map((p) => [key(p), p]))
  const incomingByKey = new Map(incoming.map((p) => [key(p), p]))

  const toCreate: I[] = []
  const toUpdateMeta: { existing: E; incoming: I }[] = []
  const toDelete: E[] = []

  for (const [k, inc] of incomingByKey) {
    const ex = existingByKey.get(k)
    if (ex) toUpdateMeta.push({ existing: ex, incoming: inc })
    else toCreate.push(inc)
  }
  for (const [k, ex] of existingByKey) {
    if (!incomingByKey.has(k)) toDelete.push(ex)
  }

  // Versions still present per package after the import, used to tell an upgrade
  // (package remains, at a different version) from an outright removal.
  const remainingByGroup = new Map<string, string[]>()
  for (const p of incoming) {
    const g = groupKey(p)
    if (!remainingByGroup.has(g)) remainingByGroup.set(g, [])
    remainingByGroup.get(g)!.push(p.version)
  }

  const supersededVersions: PackageDiff<E, I>["supersededVersions"] = []
  for (const ex of toDelete) {
    const remaining = remainingByGroup.get(groupKey(ex))
    if (remaining && remaining.length > 0) {
      supersededVersions.push({
        name: ex.name,
        ecosystem: ex.ecosystem,
        version: ex.version,
        remainingVersions: remaining,
        successor: remaining.length === 1 ? remaining[0] : null,
      })
    }
  }

  return { toCreate, toUpdateMeta, toDelete, supersededVersions }
}
