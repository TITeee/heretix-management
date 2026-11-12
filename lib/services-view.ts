import { emptySeverityCounts, getAlertSeverityTier, type SeverityCounts, type SeverityTier } from "@/lib/severity"

/**
 * The Services tab: an asset's vulnerable packages by the services that had them loaded
 * when heretix-cli collected it (Package.inUse, usedBy, needsRestart, restartNeededBy,
 * read from /proc on the host).
 *
 * The declared dependency graph cannot answer "which services does this finding touch":
 * on an RHEL host glibc alone has 363 dependents, and the graph of its vulnerable packages
 * takes in nearly every package. used-by can, and more precisely: the dynamic linker maps
 * every library a program needs, indirect ones included, so a library's used-by already
 * names each service that runs its code.
 *
 * Packages are grouped by source package (openssl-libs with openssl, the kernel's
 * subpackages together), and a group's findings are counted by vulnerability, once
 * however many of its packages carry it. Libraries that most services load (glibc, zlib,
 * openssl on a typical host) are shown once instead of on every service's row, and the
 * running kernel, which no process maps, has a place of its own.
 */

export type ServicesPackageInput = {
  name: string
  version: string
  ecosystem: string
  sourcePackage: string | null
  inUse: boolean | null
  usedBy: string[]
  needsRestart: boolean
  restartNeededBy: string[]
}

export type ServicesAlertInput = {
  packageName: string
  packageVersion: string
  externalId: string
  severity: string | null
  cvssScore: number | null
  isKev: boolean
  fixedVersion: string | null
}

/** Findings counted by vulnerability: the same CVE on several packages of a group counts once. */
export type FindingStats = {
  vulns: number
  severities: SeverityCounts
  kev: number
  /** Vulnerabilities with a fixed version known. */
  fixable: number
  worst: SeverityTier
}

export type PackageGroup = FindingStats & {
  /** The source package, or the package's own name when it has none. */
  key: string
  packages: { name: string; version: string }[]
}

export type CommonGroup = PackageGroup & {
  /** How many of the asset's services had it loaded. */
  loadedBy: number
}

/**
 * Whether a service has to be restarted for a group's upgrade to take effect. "yes": it
 * holds a replaced file of the group (heretix:restart-needed-by). "maybe": a package of
 * the group needs a restart and the service uses it, but the SBOM, from a heretix-cli
 * before 0.7.1, does not say which processes hold the old file.
 */
export type RestartNeed = "yes" | "maybe"

export type ServiceRow = FindingStats & {
  name: string
  /** A systemd unit, or the command of a process outside one (bash, sudo). */
  kind: "unit" | "process"
  /** The vulnerable packages this service has loaded, apart from the common ones and the kernel. */
  groups: (PackageGroup & { restart: RestartNeed | null })[]
  /** How many of the common groups it has loaded. */
  commonLoaded: number
  /** The groups, its own or common, whose upgrade waits on restarting it. */
  restart: { group: string; need: RestartNeed }[]
}

export type ServicesView = {
  /** Distinct services and processes in any package's used-by. */
  services: number
  vulnerableInUse: number
  vulnerableNotLoaded: number
  vulnerableUndetermined: number
  kernel: PackageGroup[]
  common: CommonGroup[]
  rows: ServiceRow[]
}

const TIER_RANK: Record<SeverityTier, number> = { critical: 0, high: 1, medium: 2, low: 3, na: 4 }

// systemd's unit types. Anything else in used-by is the command of a process outside a unit.
const UNIT_SUFFIX = /\.(service|scope|socket|timer|mount|automount|swap|path|slice|target|device)$/

/**
 * A library counts as common when at least half of the services load it. Below four
 * services, "half" would be one or two, and the common box would take in what makes the
 * services differ, so then nothing is common.
 */
const COMMON_MIN_SERVICES = 4

function groupKey(p: ServicesPackageInput): string {
  return p.sourcePackage || p.name
}

function pkgKey(name: string, version: string): string {
  return `${name}\u0000${version}`
}

/** Findings of the given alerts, each vulnerability once, at the worst severity any of its alerts has. */
function stats(alerts: ServicesAlertInput[]): FindingStats {
  const byVuln = new Map<string, { tier: SeverityTier; kev: boolean; fixable: boolean }>()
  for (const a of alerts) {
    const tier = getAlertSeverityTier(a.severity, a.cvssScore)
    const prev = byVuln.get(a.externalId)
    byVuln.set(a.externalId, {
      tier: prev && TIER_RANK[prev.tier] <= TIER_RANK[tier] ? prev.tier : tier,
      kev: (prev?.kev ?? false) || a.isKev,
      fixable: (prev?.fixable ?? false) || !!a.fixedVersion,
    })
  }
  const severities = emptySeverityCounts()
  let kev = 0
  let fixable = 0
  let worst: SeverityTier = "na"
  for (const v of byVuln.values()) {
    severities[v.tier]++
    if (v.kev) kev++
    if (v.fixable) fixable++
    if (TIER_RANK[v.tier] < TIER_RANK[worst]) worst = v.tier
  }
  return { vulns: byVuln.size, severities, kev, fixable, worst }
}

/** KEV first, then the worst severity, then the most vulnerabilities, then by name. */
function byUrgency(a: FindingStats & { key?: string; name?: string }, b: FindingStats & { key?: string; name?: string }): number {
  return (b.kev > 0 ? 1 : 0) - (a.kev > 0 ? 1 : 0)
    || TIER_RANK[a.worst] - TIER_RANK[b.worst]
    || b.vulns - a.vulns
    || (a.key ?? a.name ?? "").localeCompare(b.key ?? b.name ?? "")
}

export function buildServicesView(packages: ServicesPackageInput[], alerts: ServicesAlertInput[]): ServicesView {
  const alertsByPkg = new Map<string, ServicesAlertInput[]>()
  for (const a of alerts) {
    const k = pkgKey(a.packageName, a.packageVersion)
    const list = alertsByPkg.get(k)
    if (list) list.push(a)
    else alertsByPkg.set(k, [a])
  }

  const allServices = new Set(packages.flatMap((p) => p.usedBy))
  const vulnerable = packages.filter((p) => alertsByPkg.has(pkgKey(p.name, p.version)))

  // The vulnerable packages a process had loaded, by source package.
  type Group = { key: string; members: ServicesPackageInput[]; alerts: ServicesAlertInput[]; usedBy: Set<string> }
  const groups = new Map<string, Group>()
  for (const p of vulnerable.filter((p) => p.inUse === true)) {
    const key = groupKey(p)
    let g = groups.get(key)
    if (!g) {
      g = { key, members: [], alerts: [], usedBy: new Set() }
      groups.set(key, g)
    }
    g.members.push(p)
    g.alerts.push(...(alertsByPkg.get(pkgKey(p.name, p.version)) ?? []))
    for (const u of p.usedBy) g.usedBy.add(u)
  }

  const view = (g: Group): PackageGroup => ({
    key: g.key,
    packages: g.members.map((m) => ({ name: m.name, version: m.version })).sort((a, b) => a.name.localeCompare(b.name)),
    ...stats(g.alerts),
  })

  // In use with nobody named: the running kernel, which heretix-cli marks in use without a process.
  const kernel: PackageGroup[] = []
  const common: CommonGroup[] = []
  const own: Group[] = []
  const isCommon = (g: Group) =>
    allServices.size >= COMMON_MIN_SERVICES && g.usedBy.size * 2 >= allServices.size
  for (const g of groups.values()) {
    if (g.usedBy.size === 0) kernel.push(view(g))
    else if (isCommon(g)) common.push({ ...view(g), loadedBy: g.usedBy.size })
    else own.push(g)
  }

  // Whether restarting `service` is what an upgrade of `g` waits on.
  const restartNeed = (g: Group, service: string): RestartNeed | null => {
    let maybe = false
    for (const m of g.members) {
      if (!m.needsRestart || !m.usedBy.includes(service)) continue
      if (m.restartNeededBy.includes(service)) return "yes"
      if (m.restartNeededBy.length === 0) maybe = true
    }
    return maybe ? "maybe" : null
  }
  const commonGroups = [...groups.values()].filter((g) => g.usedBy.size > 0 && isCommon(g))

  const services = new Set([...groups.values()].flatMap((g) => [...g.usedBy]))
  const rows: ServiceRow[] = [...services].map((name) => {
    const mine = own.filter((g) => g.usedBy.has(name))
    const restart = [...mine, ...commonGroups]
      .map((g) => ({ group: g.key, need: restartNeed(g, name) }))
      .filter((r): r is { group: string; need: RestartNeed } => r.need !== null)
      .sort((a, b) => a.group.localeCompare(b.group))
    return {
      name,
      kind: UNIT_SUFFIX.test(name) ? "unit" : "process",
      groups: mine.map((g) => ({ ...view(g), restart: restartNeed(g, name) })).sort(byUrgency),
      commonLoaded: commonGroups.filter((g) => g.usedBy.has(name)).length,
      restart,
      ...stats(mine.flatMap((g) => g.alerts)),
    }
  })

  return {
    services: allServices.size,
    vulnerableInUse: vulnerable.filter((p) => p.inUse === true).length,
    vulnerableNotLoaded: vulnerable.filter((p) => p.inUse === false).length,
    vulnerableUndetermined: vulnerable.filter((p) => p.inUse === null).length,
    kernel: kernel.sort(byUrgency),
    common: common.sort(byUrgency),
    rows: rows.sort(byUrgency),
  }
}
