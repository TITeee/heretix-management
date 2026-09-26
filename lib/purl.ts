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

// Maps PURL type strings to OSV canonical ecosystem names
export const PURL_TYPE_MAP: Record<string, string> = {
  golang:   "Go",
  composer: "Packagist",
  pypi:     "PyPI",
  maven:    "Maven",
  nuget:    "NuGet",
  gem:      "RubyGems",
}

export const OS_PURL_TYPES = new Set(["rpm", "deb", "apk"])

function majorOf(ver: string): string {
  return ver.split(".")[0]
}

function majorMinorOf(ver: string): string {
  return ver.split(".").slice(0, 2).join(".")
}

/**
 * Converts an OS distro identifier and version into the OSV ecosystem string
 * heretix-api matches on — the same strings heretix-cli's collectors send.
 *
 * heretix-api matches an ecosystem by prefix, so the version must be cut to
 * exactly the granularity OSV publishes: a point release ("Rocky Linux:9.3",
 * "Debian:12.15", "Alpine:v3.20.10") prefixes nothing and silently finds no
 * vulnerabilities at all. heretix-cli already truncates at collection time;
 * Syft and Trivy pass os-release's VERSION_ID (or the full image OS version)
 * through untouched, so it's done here instead.
 *
 * The id side accepts three vocabularies for the same distros: os-release IDs
 * (Syft: "rocky", "ol", "rhel"), heretix-cli's normalized ecosystem names
 * ("rockylinux", "oraclelinux"), and Trivy's OS family names ("alma",
 * "redhat", "oracle").
 */
export function osEcosystem(distroId: string, version: string): string {
  if (!version) return ""
  switch (distroId.toLowerCase()) {
    case "almalinux":
    case "alma":        return `AlmaLinux:${majorOf(version)}`
    // "rocky" is also the legacy heretix-cli qualifier from before 2026-09-01,
    // when heretix-cli sent the ecosystem as "Rocky:N" — a value that never
    // matched anything in heretix-api's OSV data (the real ecosystem string is
    // "Rocky Linux:N"). All three spellings map to the corrected ecosystem.
    case "rockylinux":
    case "rocky":       return `Rocky Linux:${majorOf(version)}`
    case "oraclelinux":
    case "ol":
    case "oracle":      return `Oracle Linux:${majorOf(version)}`
    case "rhel":
    case "redhat":      return `Red Hat:${majorOf(version)}`
    case "centos":      return `CentOS:${majorOf(version)}`
    case "debian":      return `Debian:${majorOf(version)}`
    case "alpine":      return `Alpine:v${majorMinorOf(version)}`
    case "ubuntu": {
      // OSV only suffixes LTS releases (even-year .04) with ":LTS"; an interim
      // release like 24.10 is published as plain "Ubuntu:24.10".
      const ver = majorMinorOf(version)
      const [major, minor] = ver.split(".")
      const isLts = minor === "04" && Number(major) % 2 === 0
      return isLts ? `Ubuntu:${ver}:LTS` : `Ubuntu:${ver}`
    }
    default:            return ""
  }
}

/**
 * Converts a PURL `distro` qualifier to an OSV ecosystem.
 *
 * The qualifier is conventionally "<id>-<version>" ("almalinux-9",
 * "rocky-9.3", "ubuntu-22.04"), but Trivy writes only the version for Alpine
 * ("3.20.10") — the distro id then comes from the PURL namespace instead
 * (`pkg:apk/alpine/...`), which every scanner sets.
 */
export function distroQualifierToEcosystem(distro: string, namespace?: string): string {
  // Legacy heretix-cli builds (2026 to 2026-09-01) emitted the bare, version-less
  // "oracle-linux" qualifier — heretix-api's AdvisoryAffectedProduct lookup had no
  // per-OS-major-version column at the time, so a version segment here would have
  // been discarded server-side anyway. Checked before the split below, which would
  // otherwise misparse the hyphen inside "oracle-linux" itself as the id/version
  // boundary (id="oracle", ver="linux").
  if (distro === "oracle-linux") return "oracle-linux"

  if (/^\d/.test(distro)) return namespace ? osEcosystem(namespace, distro) : ""
  const lastDash = distro.lastIndexOf("-")
  if (lastDash === -1) return ""
  return osEcosystem(distro.slice(0, lastDash), distro.slice(lastDash + 1))
}

export type ParsedPURL = {
  type: string
  namespace: string | null
  name: string
  version: string | null
  qualifiers: Record<string, string>
  /** OSV ecosystem; "" for an OS package whose distro can't be determined. */
  ecosystem: string
}

/**
 * Parses a PURL into the fields Package and Alert rows store. The version is
 * optional: a CycloneDX VEX statement may carry it inline or list versions
 * separately under `affects[].versions[]`, leaving `ref` a bare PURL.
 *
 * `fallbackDistro` ("<id>-<version>", same shape as the qualifier) is used for
 * an OS package whose PURL has no distro qualifier, so the caller can supply
 * the OS a whole SBOM describes. Without either, an OS package's ecosystem is
 * "" and heretix-api falls back to a cross-ecosystem search.
 */
export function parsePURL(purl: string, fallbackDistro?: string): ParsedPURL | null {
  const match = purl.match(/^pkg:([\w.+-]+)\/([^@?#]+)(?:@([^?#]*))?(?:\?([^#]*))?/)
  if (!match) return null
  const [, rawType, fullPath, rawVersion, qualifierStr] = match
  const type = rawType.toLowerCase()
  // Trivy percent-encodes version characters such as '+' ("5%2Bdeb12u3").
  const version = rawVersion ? decodeURIComponent(rawVersion) : null

  const qualifiers: Record<string, string> = {}
  if (qualifierStr) {
    for (const kv of qualifierStr.split("&")) {
      const eq = kv.indexOf("=")
      if (eq > 0) qualifiers[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1))
    }
  }

  if (OS_PURL_TYPES.has(type)) {
    // OS packages: first path segment is the distro namespace, the remainder the name
    // e.g. pkg:apk/alpine/curl?distro=alpine-3.18 → ecosystem="Alpine:v3.18", name="curl"
    const slashIdx = fullPath.indexOf("/")
    const namespace = slashIdx === -1 ? null : decodeURIComponent(fullPath.slice(0, slashIdx))
    const name = decodeURIComponent(slashIdx === -1 ? fullPath : fullPath.slice(slashIdx + 1))
    const distro = qualifiers["distro"] ?? fallbackDistro
    const ecosystem = distro ? distroQualifierToEcosystem(distro, namespace ?? undefined) : ""
    return { type, namespace, name, version, qualifiers, ecosystem }
  }

  // Non-OS packages: the name keeps its namespace, joined with "/".
  // Handles scoped npm  : pkg:npm/%40auth/core       → @auth/core
  // Handles Go modules  : pkg:golang/github.com/x/net → github.com/x/net
  // Handles simple pkgs : pkg:npm/lodash              → lodash
  const ecosystem = PURL_TYPE_MAP[type] ?? type
  const lastSlash = fullPath.lastIndexOf("/")
  if (lastSlash === -1) {
    return { type, namespace: null, name: decodeURIComponent(fullPath), version, qualifiers, ecosystem }
  }
  const namespace = decodeURIComponent(fullPath.slice(0, lastSlash))
  const name = namespace + "/" + decodeURIComponent(fullPath.slice(lastSlash + 1))
  return { type, namespace, name, version, qualifiers, ecosystem }
}
