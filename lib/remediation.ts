import { buildPURL } from "@/lib/purl"
import { emptySeverityCounts, getAlertSeverityTier, type SeverityCounts, type SeverityTier } from "@/lib/severity"

/**
 * Groups an asset's open findings into the changes that would fix them, so the
 * asset page can show "update openssh (18 findings)" instead of 18 rows. Each
 * open alert lands in exactly one group. A group is display-only: nothing about
 * it is stored, and every decision is applied to the real alerts inside it.
 *
 * Findings with no fixedVersion are kept out of the actions and bundled by the
 * distro's own fix status, since no upgrade resolves them; what they need is a
 * decision (accept, or wait for the fix), not a change.
 */

export type RemediationKind =
  | "os_update"        // update an OS source package
  | "direct_upgrade"   // upgrade a direct dependency that is itself vulnerable
  | "via_direct"       // a transitive finding, fixed through the direct dependencies that pull it in
  | "go_rebuild"       // Go standard library: rebuild the binaries with a newer Go
  | "package_update"   // a package whose place in the dependency graph is unknown
  | "product_update"   // a product registered by hand (appliance firmware, software outside a package manager)

export type RemediationAlertInput = {
  id: string
  packageName: string
  packageVersion: string
  ecosystem: string
  sourcePackage: string | null
  fixedVersion: string | null
  fixStatus: string | null
  distroPriority: string | null
  severity: string | null
  cvssScore: number | null
  isKev: boolean
}

export type RemediationPackageInput = {
  name: string
  version: string
  ecosystem: string
  direct: boolean | null
  deps: string[]
  /** "manual" for a package added by hand or by CSV import; anything else came from an inventory. */
  source: string
}

type GroupStats = {
  alertIds: string[]
  severities: SeverityCounts
  kev: number
  /** The worst severity tier inside, for ordering. */
  worst: SeverityTier
}

export type RemediationAction = GroupStats & {
  key: string
  kind: RemediationKind
  /** What to change: the source package, direct dependency, or package name. */
  target: string
  /** For via_direct: the direct dependencies pulling the findings in. */
  roots: string[]
  /** Distinct fixed versions of the findings inside (one in the usual case). */
  fixedVersions: string[]
  /** Distinct vulnerable packages inside. */
  packages: string[]
}

export type NoFixGroup = GroupStats & {
  key: string
  /** The distro's fix status (heretix-api's normalized value), null when none was given. */
  fixStatus: string | null
  /** How many findings carry each distro rating; "" for none. */
  distroPriorities: Record<string, number>
}

export type RemediationPlan = {
  actions: RemediationAction[]
  noFix: NoFixGroup[]
}

// OSV ecosystem prefixes for OS packages, including the legacy spellings
// lib/purl.ts still resolves. Anything else with an ecosystem is a language
// package; an empty ecosystem (an OS package whose distro wasn't known) is
// treated as an OS package too, since language packages always carry one.
const OS_ECOSYSTEM_PREFIXES = [
  "Ubuntu:", "Debian:", "AlmaLinux:", "Rocky Linux:", "Rocky:", "Alpine:",
  "Red Hat:", "CentOS:", "Oracle Linux:",
]

export function isOsEcosystem(ecosystem: string): boolean {
  return ecosystem === "" || ecosystem === "oracle-linux" || OS_ECOSYSTEM_PREFIXES.some((p) => ecosystem.startsWith(p))
}

const TIER_RANK: Record<SeverityTier, number> = { critical: 0, high: 1, medium: 2, low: 3, na: 4 }

function newStats(): GroupStats {
  return { alertIds: [], severities: emptySeverityCounts(), kev: 0, worst: "na" }
}

function addToStats(stats: GroupStats, alert: RemediationAlertInput) {
  const tier = getAlertSeverityTier(alert.severity, alert.cvssScore)
  stats.alertIds.push(alert.id)
  stats.severities[tier]++
  if (alert.isKev) stats.kev++
  if (TIER_RANK[tier] < TIER_RANK[stats.worst]) stats.worst = tier
}

/** KEV first, then the worst severity, then the most findings. */
function byUrgency(a: GroupStats, b: GroupStats): number {
  return (b.kev > 0 ? 1 : 0) - (a.kev > 0 ? 1 : 0)
    || TIER_RANK[a.worst] - TIER_RANK[b.worst]
    || b.alertIds.length - a.alertIds.length
}

/**
 * The direct dependencies a package is pulled in through, walking Package.deps
 * upward. Stops at the first direct package on each path; a package nothing
 * direct reaches (no dependency graph in the SBOM) has none.
 */
function directRoots(
  purl: string,
  byPurl: Map<string, RemediationPackageInput>,
  parents: Map<string, string[]>,
): string[] {
  const roots = new Set<string>()
  const seen = new Set<string>()
  const queue = [...(parents.get(purl) ?? [])]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (seen.has(current)) continue
    seen.add(current)
    const pkg = byPurl.get(current)
    if (pkg?.direct === true) {
      roots.add(pkg.name)
      continue
    }
    queue.push(...(parents.get(current) ?? []))
  }
  return [...roots].sort()
}

export function buildRemediationPlan(
  alerts: RemediationAlertInput[],
  packages: RemediationPackageInput[],
): RemediationPlan {
  const purlOf = (p: { name: string; version: string; ecosystem: string }) => buildPURL(p.name, p.version, p.ecosystem)
  const byPurl = new Map(packages.map((p) => [purlOf(p), p]))
  const parents = new Map<string, string[]>()
  for (const p of packages) {
    for (const dep of p.deps) {
      const list = parents.get(dep)
      if (list) list.push(purlOf(p))
      else parents.set(dep, [purlOf(p)])
    }
  }
  // heretix-api may report a finding under a different ecosystem than the
  // Package row's (see lib/scan.ts), so packages are found by name + version.
  const packageByNameVersion = new Map(packages.map((p) => [`${p.name}\u0000${p.version}`, p]))

  const actions = new Map<string, RemediationAction & { fixedSet: Set<string>; packageSet: Set<string> }>()
  const noFix = new Map<string, NoFixGroup>()

  const action = (kind: RemediationKind, target: string, roots: string[] = []) => {
    const key = `${kind}\u0000${target}`
    let group = actions.get(key)
    if (!group) {
      group = { ...newStats(), key, kind, target, roots, fixedVersions: [], packages: [], fixedSet: new Set(), packageSet: new Set() }
      actions.set(key, group)
    }
    return group
  }

  for (const alert of alerts) {
    if (!alert.fixedVersion) {
      const key = alert.fixStatus ?? ""
      let group = noFix.get(key)
      if (!group) {
        group = { ...newStats(), key, fixStatus: alert.fixStatus, distroPriorities: {} }
        noFix.set(key, group)
      }
      addToStats(group, alert)
      const priority = alert.distroPriority ?? ""
      group.distroPriorities[priority] = (group.distroPriorities[priority] ?? 0) + 1
      continue
    }

    let group: ReturnType<typeof action>
    const pkg = packageByNameVersion.get(`${alert.packageName}\u0000${alert.packageVersion}`)
    // Checked first: an appliance's findings come back with an empty or
    // "advisory" ecosystem, which would otherwise read as an OS package.
    if (pkg?.source === "manual") {
      group = action("product_update", alert.packageName)
    } else if (isOsEcosystem(alert.ecosystem)) {
      group = action("os_update", alert.sourcePackage ?? alert.packageName)
    } else {
      const roots = pkg && pkg.direct !== true ? directRoots(purlOf(pkg), byPurl, parents) : []
      if (pkg?.direct === true) {
        group = action("direct_upgrade", alert.packageName)
      } else if (roots.length > 0) {
        group = action("via_direct", roots.join(" / "), roots)
      } else if (alert.ecosystem === "Go" && alert.packageName === "stdlib") {
        group = action("go_rebuild", "stdlib")
      } else {
        group = action("package_update", alert.packageName)
      }
    }
    addToStats(group, alert)
    group.fixedSet.add(alert.fixedVersion)
    group.packageSet.add(alert.packageName)
  }

  return {
    actions: [...actions.values()]
      .map(({ fixedSet, packageSet, ...group }) => ({
        ...group,
        fixedVersions: [...fixedSet].sort(),
        packages: [...packageSet].sort(),
      }))
      .sort(byUrgency),
    noFix: [...noFix.values()].sort(byUrgency),
  }
}
