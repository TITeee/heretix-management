export type AssetRef = { id: string; name: string }

/** The key a package version is counted under: the tag cards are one per name and version. */
export function packageVersionKey(name: string, version: string): string {
  return `${name}@${version}`
}

/**
 * The assets each package version is installed on, by name and version. An asset that holds the
 * same name and version more than once (two locations, two ecosystems) counts once, and each list
 * is in name order.
 */
export function groupAssetsByPackageVersion(
  installs: { name: string; version: string; asset: AssetRef }[],
): Map<string, AssetRef[]> {
  const byKey = new Map<string, Map<string, AssetRef>>()
  for (const { name, version, asset } of installs) {
    const key = packageVersionKey(name, version)
    if (!byKey.has(key)) byKey.set(key, new Map())
    byKey.get(key)!.set(asset.id, asset)
  }
  return new Map(
    [...byKey].map(([key, assets]) => [key, [...assets.values()].sort((a, b) => a.name.localeCompare(b.name))]),
  )
}
