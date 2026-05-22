import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export type GraphNode = {
  id: string         // PURL
  name: string
  version: string
  direct: boolean | null
  vulnerable: boolean
  alertCount: number
  hop: number        // 0 = vulnerable, 1 = depends on vulnerable, 2 = depends on 1-hop
}

export type GraphEdge = {
  source: string  // PURL of package that HAS the dep
  target: string  // PURL of the dep
}

export type DependencyGraphData = {
  hasDepsData: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function buildPURL(name: string, version: string, ecosystem: string): string {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params
  const hops = Math.min(8, Math.max(1, parseInt(new URL(req.url).searchParams.get("hops") ?? "2", 10) || 2))

  const [pkgs, alerts] = await Promise.all([
    prisma.package.findMany({
      where: { assetId },
      select: { name: true, version: true, ecosystem: true, direct: true, deps: true },
    }),
    prisma.alert.groupBy({
      by: ["packageName", "packageVersion"],
      where: { assetId, status: { in: ["open", "in_progress"] } },
      _count: { id: true },
    }),
  ])

  const hasDepsData = pkgs.some(p => p.deps.length > 0)
  if (!hasDepsData) {
    return NextResponse.json({ hasDepsData: false, nodes: [], edges: [] })
  }

  // Build alert count map: "name::version" → count
  const alertMap = new Map(alerts.map(a => [`${a.packageName}::${a.packageVersion}`, a._count.id]))

  // Build PURL → pkg map
  type PkgInfo = { name: string; version: string; ecosystem: string; direct: boolean | null; deps: string[]; purl: string; alertCount: number }
  const pkgMap = new Map<string, PkgInfo>()
  for (const pkg of pkgs) {
    const purl = buildPURL(pkg.name, pkg.version, pkg.ecosystem)
    pkgMap.set(purl, {
      ...pkg,
      purl,
      alertCount: alertMap.get(`${pkg.name}::${pkg.version}`) ?? 0,
    })
  }

  // Collect vulnerable PURLs (hop = 0)
  const vulnerablePurls = new Set<string>()
  for (const [purl, pkg] of pkgMap) {
    if (pkg.alertCount > 0) vulnerablePurls.add(purl)
  }

  if (vulnerablePurls.size === 0) {
    return NextResponse.json({ hasDepsData: true, nodes: [], edges: [] })
  }

  // BFS: find packages that depend on vulnerable (and their parents) up to `hops` hops
  const includedPurls = new Map<string, number>() // purl → hop
  const includedEdges: GraphEdge[] = []

  for (const vPurl of vulnerablePurls) includedPurls.set(vPurl, 0)

  for (let hop = 1; hop <= hops; hop++) {
    const targetPurls = [...includedPurls.entries()].filter(([, h]) => h === hop - 1).map(([p]) => p)
    for (const [purl, pkg] of pkgMap) {
      if (includedPurls.has(purl)) continue
      const depsHit = pkg.deps.filter(d => targetPurls.includes(d))
      if (depsHit.length > 0) {
        includedPurls.set(purl, hop)
        for (const d of depsHit) {
          includedEdges.push({ source: purl, target: d })
        }
      }
    }
  }

  const nodes: GraphNode[] = []
  for (const [purl, hop] of includedPurls) {
    const pkg = pkgMap.get(purl)
    if (!pkg) continue
    nodes.push({
      id: purl,
      name: pkg.name,
      version: pkg.version,
      direct: pkg.direct,
      vulnerable: pkg.alertCount > 0,
      alertCount: pkg.alertCount,
      hop,
    })
  }

  return NextResponse.json({ hasDepsData: true, nodes, edges: includedEdges } satisfies DependencyGraphData)
}
