import { buildPURL } from "@/lib/purl"
import { isOsEcosystem } from "@/lib/remediation"
import { getAlertSeverityTier, type SeverityTier } from "@/lib/severity"

/**
 * The Dependency Graph tab: what depends on one vulnerable package, up to a number of hops.
 *
 * It used to draw every vulnerable package and their dependents at once. On an OS host
 * that is nearly everything: on an RHEL 9.8 host glibc alone has 363 dependents and is
 * itself vulnerable, so the graph took in 493 of 519 packages with 2,288 edges. Now it
 * starts from one package (the most urgent unless one is chosen), and keeps the drawing
 * readable in three ways:
 *
 *  - OS packages are grouped by source package (openssl-libs with openssl), the unit an
 *    OS update and the Remediation tab work in.
 *  - A node with more than `fanInCap` dependents shows that many and the count of the
 *    rest, which the user can open (`expand`). Those shown first are the ones already in
 *    the drawing, then direct packages, packages in use, and vulnerable ones.
 *  - An edge A -> C is left out when A reaches C through another drawn edge (A -> B -> C);
 *    dpkg and rpm declare many such, and what depends on what is the same without them.
 */

export type GraphPackageInput = {
  name: string
  version: string
  ecosystem: string
  direct: boolean | null
  deps: string[]
  sourcePackage: string | null
  inUse?: boolean | null
}

export type GraphAlertInput = {
  packageName: string
  packageVersion: string
  externalId: string
  severity: string | null
  cvssScore: number | null
  isKev: boolean
}

export type GraphNode = {
  /** The source package ("src:openssl") for OS packages, the PURL for others. */
  id: string
  name: string
  /** The version, when every package in the node has the same one; "" otherwise. */
  version: string
  packages: { name: string; version: string }[]
  direct: boolean | null
  inUse: boolean | null
  vulnerable: boolean
  /** Distinct vulnerabilities among the node's open alerts. */
  vulns: number
  kev: number
  worst: SeverityTier
  /** 0 for the package the graph starts from, 1 for what depends on it directly, ... */
  hop: number
  /** Dependents left out of the drawing (see fanInCap). */
  hiddenDependents: number
}

export type GraphEdge = {
  /** The node that depends ... */
  source: string
  /** ... on this one. */
  target: string
}

/** A vulnerable node the graph can start from, most urgent first. */
export type GraphTarget = { id: string; name: string; vulns: number; kev: number; worst: SeverityTier }

export type DependencyGraphData = {
  hasDepsData: boolean
  targets: GraphTarget[]
  focus: string | null
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** How many nodes depend on the focus within the hops, drawn or not. */
  dependentsWithinHops: number
}

export const DEFAULT_FAN_IN_CAP = 8

const TIER_RANK: Record<SeverityTier, number> = { critical: 0, high: 1, medium: 2, low: 3, na: 4 }

type Group = {
  id: string
  name: string
  packages: GraphPackageInput[]
  direct: boolean | null
  inUse: boolean | null
  vulnIds: Set<string>
  kevIds: Set<string>
  worst: SeverityTier
}

function groupIdOf(p: GraphPackageInput): string {
  return isOsEcosystem(p.ecosystem) ? `src:${p.sourcePackage || p.name}` : buildPURL(p.name, p.version, p.ecosystem)
}

function triState(values: (boolean | null | undefined)[]): boolean | null {
  if (values.some((v) => v === true)) return true
  if (values.some((v) => v === false)) return false
  return null
}

function byUrgency(a: Group, b: Group): number {
  return (b.kevIds.size > 0 ? 1 : 0) - (a.kevIds.size > 0 ? 1 : 0)
    || TIER_RANK[a.worst] - TIER_RANK[b.worst]
    || b.vulnIds.size - a.vulnIds.size
    || a.name.localeCompare(b.name)
}

export function buildDependencyGraph(
  packages: GraphPackageInput[],
  alerts: GraphAlertInput[],
  options: { focus?: string | null; hops: number; expand?: Set<string>; fanInCap?: number },
): DependencyGraphData {
  const fanInCap = options.fanInCap ?? DEFAULT_FAN_IN_CAP
  const expand = options.expand ?? new Set<string>()
  const hasDepsData = packages.some((p) => p.deps.length > 0)

  // Packages into nodes.
  const groups = new Map<string, Group>()
  const groupOfPurl = new Map<string, string>()
  const groupOfPkg = new Map<string, string>()
  for (const p of packages) {
    const id = groupIdOf(p)
    let g = groups.get(id)
    if (!g) {
      g = { id, name: isOsEcosystem(p.ecosystem) ? p.sourcePackage || p.name : p.name, packages: [], direct: null, inUse: null, vulnIds: new Set(), kevIds: new Set(), worst: "na" }
      groups.set(id, g)
    }
    g.packages.push(p)
    groupOfPurl.set(buildPURL(p.name, p.version, p.ecosystem), id)
    groupOfPkg.set(`${p.name}\u0000${p.version}`, id)
  }
  for (const g of groups.values()) {
    g.direct = triState(g.packages.map((p) => p.direct))
    g.inUse = triState(g.packages.map((p) => p.inUse))
  }
  for (const a of alerts) {
    const g = groups.get(groupOfPkg.get(`${a.packageName}\u0000${a.packageVersion}`) ?? "")
    if (!g) continue
    g.vulnIds.add(a.externalId)
    if (a.isKev) g.kevIds.add(a.externalId)
    const tier = getAlertSeverityTier(a.severity, a.cvssScore)
    if (TIER_RANK[tier] < TIER_RANK[g.worst]) g.worst = tier
  }

  // Node -> the nodes that depend on it.
  const dependents = new Map<string, Set<string>>()
  for (const p of packages) {
    const from = groupOfPurl.get(buildPURL(p.name, p.version, p.ecosystem))!
    for (const d of p.deps) {
      const to = groupOfPurl.get(d)
      if (!to || to === from) continue
      let set = dependents.get(to)
      if (!set) dependents.set(to, (set = new Set()))
      set.add(from)
    }
  }

  const targets = [...groups.values()].filter((g) => g.vulnIds.size > 0).sort(byUrgency)
  const focus = targets.find((t) => t.id === options.focus) ?? targets[0]
  const result: DependencyGraphData = {
    hasDepsData,
    targets: targets.map((g) => ({ id: g.id, name: g.name, vulns: g.vulnIds.size, kev: g.kevIds.size, worst: g.worst })),
    focus: focus?.id ?? null,
    nodes: [],
    edges: [],
    dependentsWithinHops: 0,
  }
  if (!focus) return result

  // Everything that depends on the focus within the hops, for the count.
  const reached = new Set<string>([focus.id])
  let frontier = [focus.id]
  for (let hop = 1; hop <= options.hops && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const id of frontier) for (const d of dependents.get(id) ?? []) if (!reached.has(d)) { reached.add(d); next.push(d) }
    frontier = next
  }
  result.dependentsWithinHops = reached.size - 1

  // The drawing: the same walk, with each node's dependents capped.
  const hopOf = new Map<string, number>([[focus.id, 0]])
  const hidden = new Map<string, number>()
  const edgeSet = new Set<string>()
  const rank = (id: string) => {
    const g = groups.get(id)!
    return (hopOf.has(id) ? 0 : 8) + (g.direct === true ? 0 : 4) + (g.inUse === true ? 0 : 2) + (g.vulnIds.size > 0 ? 0 : 1)
  }
  frontier = [focus.id]
  for (let hop = 1; hop <= options.hops && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      const all = [...(dependents.get(id) ?? [])].sort((a, b) => rank(a) - rank(b) || groups.get(a)!.name.localeCompare(groups.get(b)!.name))
      const shown = expand.has(id) || all.length <= fanInCap ? all : all.slice(0, fanInCap)
      if (shown.length < all.length) hidden.set(id, all.length - shown.length)
      for (const d of shown) {
        edgeSet.add(`${d}\u0000${id}`)
        if (!hopOf.has(d)) {
          hopOf.set(d, hop)
          next.push(d)
        }
      }
    }
    frontier = next
  }

  // Leave out A -> C when A reaches C through another drawn edge.
  const out = new Map<string, string[]>()
  for (const e of edgeSet) {
    const [s, t] = e.split("\u0000")
    const list = out.get(s)
    if (list) list.push(t)
    else out.set(s, [t])
  }
  const reachesWithout = (from: string, to: string, skip: string): boolean => {
    const seen = new Set<string>([from])
    const stack = [from]
    while (stack.length > 0) {
      const n = stack.pop()!
      for (const m of out.get(n) ?? []) {
        if (`${n}\u0000${m}` === skip) continue
        if (m === to) return true
        if (!seen.has(m)) { seen.add(m); stack.push(m) }
      }
    }
    return false
  }
  for (const [s, targetsOfS] of out) {
    for (const t of targetsOfS) {
      const key = `${s}\u0000${t}`
      if (targetsOfS.some((b) => b !== t && edgeSet.has(`${s}\u0000${b}`) && reachesWithout(b, t, key))) edgeSet.delete(key)
    }
  }

  result.nodes = [...hopOf].map(([id, hop]) => {
    const g = groups.get(id)!
    const versions = new Set(g.packages.map((p) => p.version))
    return {
      id, name: g.name, version: versions.size === 1 ? g.packages[0].version : "",
      packages: g.packages.map((p) => ({ name: p.name, version: p.version })).sort((a, b) => a.name.localeCompare(b.name)),
      direct: g.direct, inUse: g.inUse, vulnerable: g.vulnIds.size > 0, vulns: g.vulnIds.size, kev: g.kevIds.size, worst: g.worst,
      hop, hiddenDependents: hidden.get(id) ?? 0,
    }
  })
  result.edges = [...edgeSet].map((e) => {
    const [source, target] = e.split("\u0000")
    return { source, target }
  })
  return result
}
