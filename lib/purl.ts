/**
 * Reconstructs a plain PURL (no qualifiers) from the parsed fields a Package
 * row stores. Shared so that anything comparing PURLs derived this way — the
 * dependency graph's nodes, or a Package.deps entry built from an imported
 * SBOM's dependency graph — reconstructs them identically and actually matches.
 */
export function buildPURL(name: string, version: string, ecosystem: string): string {
  const encoded = name.startsWith("@")
    ? (() => { const [s, p] = name.slice(1).split("/"); return `%40${s}/${p}` })()
    : name
  if (ecosystem === "npm")        return `pkg:npm/${encoded}@${version}`
  if (ecosystem === "PyPI")       return `pkg:pypi/${name}@${version}`
  if (ecosystem === "Go")         return `pkg:golang/${name}@${version}`
  if (ecosystem === "Maven")      return `pkg:maven/${name}@${version}`
  if (ecosystem === "NuGet")      return `pkg:nuget/${name}@${version}`
  if (ecosystem === "RubyGems")   return `pkg:gem/${name}@${version}`
  if (ecosystem === "Packagist")  return `pkg:composer/${name}@${version}`
  if (ecosystem.startsWith("Ubuntu:"))    return `pkg:deb/ubuntu/${name}@${version}`
  if (ecosystem.startsWith("Debian:"))    return `pkg:deb/debian/${name}@${version}`
  if (ecosystem.startsWith("AlmaLinux:")) return `pkg:rpm/almalinux/${name}@${version}`
  if (ecosystem.startsWith("Rocky:"))     return `pkg:rpm/rocky/${name}@${version}`
  if (ecosystem.startsWith("Alpine:"))    return `pkg:apk/alpine/${name}@${version}`
  if (ecosystem.startsWith("Red Hat:"))   return `pkg:rpm/rhel/${name}@${version}`
  if (ecosystem.startsWith("CentOS:"))    return `pkg:rpm/centos/${name}@${version}`
  if (ecosystem === "oracle-linux")       return `pkg:rpm/oraclelinux/${name}@${version}`
  return `pkg:generic/${name}@${version}`
}
