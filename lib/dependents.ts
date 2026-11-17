import { buildPURL } from "@/lib/purl"
import { isOsEcosystem } from "@/lib/remediation"

/**
 * The alert's Dependents tab: what brings a vulnerable package into the asset.
 *
 * It used to list every dependency path up to five hops and draw all of them. Paths
 * multiply with each hop: on a Next.js image es-errors has 4,617 paths within five hops
 * but only three direct dependencies that bring it in, and on an RHEL host glibc has 484
 * packages above it. The drawing was unusable, and the five-hop cut missed entry points
 * further up (gopd and get-intrinsic sit seven hops under their direct dependency).
 *
 * It now answers the question the tab is for: which packages someone installed bring it
 * in, since those are what can be upgraded or removed. An entry point is a package above
 * the target that is marked direct, or that nothing depends on. Each comes with one
 * shortest path down to the target and the number of other paths. The search goes up
 * without a depth limit and stops at nothing but the packages themselves.
 *
 * OS packages are grouped by source package (kernel-core with kernel), as the Dependency
 * Graph, Remediation and Services tabs do. Language packages stay one per package.
 */

export type DependentsPackageInput = {
  name: string
  version: string
  ecosystem: string
  direct: boolean | null
  deps: string[]
  sourcePackage: string | null
  scope: string | null
  category: string | null
  inUse: boolean | null
  /** The services and processes that had it loaded when heretix-cli collected the host. */
  usedBy?: string[]
}

export type DependentsEntry = {
  /** The node id the Dependency Graph uses: "src:<source>" for OS packages, the PURL otherwise. */
  key: string
  /** The source package for OS packages, the package name otherwise. */
  name: string
  /** The entry point packages of this group, by name. */
  packages: { name: string; version: string }[]
  /** The version of the package the shown path starts from. */
  version: string
  direct: boolean
  /**
   * A service had both one of its packages and the vulnerable package loaded: it runs the
   * vulnerable code. Not just "one of its packages was loaded": a group's member can be in
   * use while the path to the target goes through another one, or no service of it loads
   * the target at all.
   */
  running: boolean
  /** Those services. */
  services: string[]
  /** One of its packages has open alerts of its own. */
  vulnerable: boolean
  /** Every package of it is a development dependency, not shipped. */
  dev: boolean
  /** Every package of it is present but never run (kernel headers, build tools). */
  notRun: boolean
  /** A metapackage (ubuntu-server): it brings in nearly everything, so it says little. */
  meta: boolean
  /** Package names from the entry point down to the target, both included. */
  path: string[]
  /** Paths from the entry point besides the shown one, counted up to PATH_COUNT_CAP. */
  otherPaths: number
  otherPathsCapped: boolean
}

export type DependentsData = {
  hasDepsData: boolean
  target: { name: string; version: string; sourcePackage: string | null; graphId: string; direct: boolean | null } | null
  /** Packages that depend on the target, directly or not. */
  dependents: number
  /** Of those, the ones that depend on it directly. */
  directDependents: number
  entries: DependentsEntry[]
}

export const PATH_COUNT_CAP = 999

function groupKey(p: DependentsPackageInput): string {
  return isOsEcosystem(p.ecosystem) ? `src:${p.sourcePackage || p.name}` : buildPURL(p.name, p.version, p.ecosystem)
}

function groupName(p: DependentsPackageInput): string {
  return isOsEcosystem(p.ecosystem) ? p.sourcePackage || p.name : p.name
}

/** Debian and Ubuntu build their metapackages from one source named "*-meta" (ubuntu-meta). */
function isMeta(p: DependentsPackageInput): boolean {
  return isOsEcosystem(p.ecosystem) && !!p.sourcePackage && p.sourcePackage.endsWith("-meta")
}

/** An npm development dependency: excluded from the runtime with no category of its own. */
function isDev(p: DependentsPackageInput): boolean {
  return p.scope === "excluded" && p.category === null
}

function isNotRun(p: DependentsPackageInput): boolean {
  return p.category === "kernel" || p.category === "build"
}

/** Where an entry sorts: running, then direct, then vulnerable, then the rest; metapackages and what is never run last. */
function rank(e: DependentsEntry): number {
  if (e.dev || e.notRun) return 5
  if (e.meta) return 4
  if (e.running) return 0
  if (e.direct) return 1
  if (e.vulnerable) return 2
  return 3
}

export function buildDependents(
  packages: DependentsPackageInput[],
  target: { name: string; version: string; ecosystem: string },
  vulnerable: Set<string>,
): DependentsData {
  const hasDepsData = packages.some((p) => p.deps.length > 0)
  const empty: DependentsData = { hasDepsData, target: null, dependents: 0, directDependents: 0, entries: [] }

  const byPurl = new Map<string, DependentsPackageInput>()
  for (const p of packages) byPurl.set(buildPURL(p.name, p.version, p.ecosystem), p)
  const targetPurl = buildPURL(target.name, target.version, target.ecosystem)
  const targetPkg = byPurl.get(targetPurl)
  if (!targetPkg) return empty

  // purl -> the purls that depend on it
  const parents = new Map<string, Set<string>>()
  for (const [purl, p] of byPurl) {
    for (const d of p.deps) {
      if (d === purl || !byPurl.has(d)) continue
      let set = parents.get(d)
      if (!set) parents.set(d, (set = new Set()))
      set.add(purl)
    }
  }

  // Up from the target, breadth first: the distance of every package above it, and the
  // step down a shortest path takes.
  const dist = new Map<string, number>([[targetPurl, 0]])
  const down = new Map<string, string>()
  const queue = [targetPurl]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    for (const parent of parents.get(cur) ?? []) {
      if (dist.has(parent)) continue
      dist.set(parent, dist.get(cur)! + 1)
      down.set(parent, cur)
      queue.push(parent)
    }
  }

  // Paths from `from` down to the target, through packages above the target only, up to
  // the cap: every step down then still leads to the target, so the count stays cheap.
  const countPaths = (from: string): number => {
    let count = 0
    const onPath = new Set<string>()
    const walk = (cur: string): boolean => {
      // One past the cap, so that "other paths" (all but the shown one) can tell it went over.
      if (cur === targetPurl) { count++; return count > PATH_COUNT_CAP + 1 }
      onPath.add(cur)
      for (const d of byPurl.get(cur)!.deps) {
        if (!dist.has(d) || onPath.has(d)) continue
        if (walk(d)) { onPath.delete(cur); return true }
      }
      onPath.delete(cur)
      return false
    }
    walk(from)
    return count
  }

  // The services that run the vulnerable code: those that had the target loaded.
  const targetServices = new Set(targetPkg.usedBy ?? [])

  type Member = { pkg: DependentsPackageInput; path: string[]; paths: number; services: string[] }
  const groups = new Map<string, Member[]>()
  for (const [purl, d] of dist) {
    if (d === 0) continue
    const pkg = byPurl.get(purl)!
    if (pkg.direct !== true && (parents.get(purl)?.size ?? 0) > 0) continue
    const path: string[] = []
    for (let step: string | undefined = purl; step; step = down.get(step)) path.push(byPurl.get(step)!.name)
    const key = groupKey(pkg)
    const list = groups.get(key) ?? []
    list.push({ pkg, path, paths: countPaths(purl), services: (pkg.usedBy ?? []).filter((u) => targetServices.has(u)) })
    groups.set(key, list)
  }

  const entries: DependentsEntry[] = [...groups.entries()].map(([key, members]) => {
    // The path shown starts from a running member when there is one, so it is the one that runs.
    members.sort((a, b) => (b.services.length > 0 ? 1 : 0) - (a.services.length > 0 ? 1 : 0)
      || a.path.length - b.path.length || a.pkg.name.localeCompare(b.pkg.name))
    const shown = members[0]
    const services = [...new Set(members.flatMap((m) => m.services))].sort()
    const total = members.reduce((n, m) => n + m.paths, 0)
    return {
      key,
      name: groupName(shown.pkg),
      packages: members.map((m) => ({ name: m.pkg.name, version: m.pkg.version })).sort((a, b) => a.name.localeCompare(b.name)),
      version: shown.pkg.version,
      direct: members.some((m) => m.pkg.direct === true),
      running: services.length > 0,
      services,
      vulnerable: members.some((m) => vulnerable.has(`${m.pkg.name}\u0000${m.pkg.version}`)),
      dev: members.every((m) => isDev(m.pkg)),
      notRun: members.every((m) => isNotRun(m.pkg)),
      meta: members.some((m) => isMeta(m.pkg)),
      path: shown.path,
      otherPaths: Math.min(Math.max(total - 1, 0), PATH_COUNT_CAP),
      otherPathsCapped: total - 1 > PATH_COUNT_CAP,
    }
  })
  entries.sort((a, b) => rank(a) - rank(b) || a.path.length - b.path.length || a.name.localeCompare(b.name))

  return {
    hasDepsData,
    target: {
      name: targetPkg.name,
      version: targetPkg.version,
      sourcePackage: targetPkg.sourcePackage,
      graphId: groupKey(targetPkg),
      direct: targetPkg.direct,
    },
    dependents: dist.size - 1,
    directDependents: parents.get(targetPurl)?.size ?? 0,
    entries,
  }
}
