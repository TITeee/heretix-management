import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

function buildPURL(name: string, version: string, ecosystem: string): string {
  const encoded = name.startsWith("@")
    ? (() => { const [scope, pkg] = name.slice(1).split("/"); return `%40${scope}/${pkg}` })()
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

type PkgNode = {
  name: string
  version: string
  direct: boolean | null
  deps: string[]
  purl: string
}

type ChainItem = { name: string; version: string; direct: boolean | null }
type DependentPath = { chain: ChainItem[] }

// Find all upstream dependency paths to the target PURL.
// chain is built from direct parent → ... → immediate parent of target.
function findPaths(
  targetPurl: string,
  pkgByPurl: Map<string, PkgNode>,
  visited: Set<string>,
  maxDepth: number
): DependentPath[] {
  if (maxDepth <= 0) return []

  const results: DependentPath[] = []

  for (const [purl, pkg] of pkgByPurl) {
    if (visited.has(purl)) continue
    if (!pkg.deps.includes(targetPurl)) continue

    const node: ChainItem = { name: pkg.name, version: pkg.version, direct: pkg.direct }

    if (pkg.direct === true) {
      results.push({ chain: [node] })
    } else {
      const newVisited = new Set([...visited, targetPurl])
      const parentPaths = findPaths(purl, pkgByPurl, newVisited, maxDepth - 1)
      if (parentPaths.length > 0) {
        for (const pp of parentPaths) {
          results.push({ chain: [...pp.chain, node] })
        }
      } else {
        // No direct ancestor found within depth; show as standalone dependent
        results.push({ chain: [node] })
      }
    }
  }

  return results
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const alert = await prisma.alert.findUnique({
    where: { id },
    select: { assetId: true, packageName: true, packageVersion: true, ecosystem: true },
  })
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Build the vulnerable package's PURL
  const vulnerablePurl = buildPURL(alert.packageName, alert.packageVersion, alert.ecosystem)

  // Fetch all packages of this asset that have any deps data
  const allPkgs = await prisma.package.findMany({
    where: { assetId: alert.assetId },
    select: { name: true, version: true, ecosystem: true, direct: true, deps: true },
  })

  // Check if deps data is available at all for this asset
  const hasDepsData = allPkgs.some(p => p.deps.length > 0)
  if (!hasDepsData) {
    return NextResponse.json({ hasDepsData: false, dependents: [] })
  }

  // Build PURL → PkgNode map
  const pkgByPurl = new Map<string, PkgNode>()
  for (const pkg of allPkgs) {
    const purl = buildPURL(pkg.name, pkg.version, pkg.ecosystem)
    pkgByPurl.set(purl, { ...pkg, purl })
  }

  const paths = findPaths(vulnerablePurl, pkgByPurl, new Set([vulnerablePurl]), 5)

  // Deduplicate paths with identical chains
  const seen = new Set<string>()
  const dedupedPaths = paths.filter(p => {
    const key = p.chain.map(n => `${n.name}@${n.version}`).join(">")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort: direct dependents first, then by chain length
  dedupedPaths.sort((a, b) => {
    const aIsDirect = a.chain[0]?.direct === true
    const bIsDirect = b.chain[0]?.direct === true
    if (aIsDirect !== bIsDirect) return aIsDirect ? -1 : 1
    return a.chain.length - b.chain.length
  })

  return NextResponse.json({
    hasDepsData: true,
    vulnerablePurl,
    dependents: dedupedPaths,
  })
}
