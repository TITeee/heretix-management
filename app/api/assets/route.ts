import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { diffPackages } from "@/lib/package-diff"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim()
  const limit = parseInt(searchParams.get("limit") ?? "0")

  const assets = await prisma.asset.findMany({
    where: search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { hostname: { contains: search, mode: "insensitive" } },
      ],
    } : undefined,
    orderBy: { createdAt: "desc" },
    ...(limit > 0 && { take: limit }),
    include: { _count: { select: { packages: true, alerts: true } } },
  })
  return NextResponse.json(assets)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()

    // Convert CycloneDX BOM to inventory format.
    // Handles both direct body (future API use) and body.inventory (UI file upload).
    if (body.bomFormat === "CycloneDX") {
      body.inventory = convertCycloneDXToInventory(body)
    } else if (body.inventory?.bomFormat === "CycloneDX") {
      body.inventory = convertCycloneDXToInventory(body.inventory)
    }

    const { name, inventory, hostname: simpleHostname, assetType: simpleAssetType, dryRun } = body

    // Simple creation (no inventory) — used by Add Manually
    if (!inventory) {
      if (!simpleHostname) {
        return NextResponse.json({ error: "hostname is required" }, { status: 400 })
      }
      const existing = await prisma.asset.findFirst({ where: { hostname: simpleHostname } })
      if (existing) {
        return NextResponse.json({ error: "Hostname already exists" }, { status: 409 })
      }
      const asset = await prisma.asset.create({
        data: {
          name: name ?? simpleHostname,
          hostname: simpleHostname,
          assetType: simpleAssetType === "docker_image" ? "docker_image" : "host",
          osId: "manual",
          osVersionId: "manual",
          osName: "Manual Asset",
        },
      })
      await createAuditLog({
        userId: session.user.id, userEmail: session.user.email,
        action: "asset_created", target: asset.name || asset.hostname,
        detail: `hostname: ${asset.hostname}`,
      })
      return NextResponse.json(asset, { status: 201 })
    }

    if (!inventory?.packages || !Array.isArray(inventory.packages)) {
      return NextResponse.json({ error: "Invalid inventory format" }, { status: 400 })
    }

    const hostname = inventory.hostname ?? "unknown"
    const assetType = inventory.type === "docker_image" ? "docker_image" : "host"
    const incomingPackages = inventory.packages.map((p: {
      name: string
      version: string
      rawVersion: string
      ecosystem: string
      source: string
      location?: string
      direct?: boolean | null
      deps?: string[]
    }) => ({
      name: p.name,
      version: p.version,
      rawVersion: p.rawVersion,
      ecosystem: PURL_TYPE_MAP[p.ecosystem] ?? p.ecosystem,
      source: p.source,
      location: p.location ?? null,
      direct: p.direct ?? null,
      deps: p.deps ?? [],
    }))

    const existing = await prisma.asset.findFirst({ where: { hostname } })

    // Preview mode for the manual upload UI: report what an import would do
    // (which existing asset it matches, and the package diff) without
    // committing, so the user can confirm before a hostname collision
    // silently overwrites the wrong asset.
    if (dryRun) {
      if (!existing) return NextResponse.json({ existing: null })

      const existingPkgs = await prisma.package.findMany({
        where: { assetId: existing.id, source: { not: "manual" } },
        select: { name: true, ecosystem: true, version: true },
      })
      const { toCreate, toDelete, supersededVersions } = diffPackages(
        existingPkgs,
        incomingPackages as { name: string; version: string; ecosystem: string }[]
      )

      return NextResponse.json({
        existing: { id: existing.id, name: existing.name, hostname: existing.hostname, scannedAt: existing.scannedAt },
        diff: {
          added: toCreate.length,
          removed: toDelete.length,
          // Superseded versions are a subset of the removals, surfaced separately
          // because those are the ones whose alerts get auto-resolved.
          superseded: supersededVersions.length,
        },
      })
    }

    if (existing) {
      const existingPkgs = await prisma.package.findMany({
        where: { assetId: existing.id, source: { not: "manual" } },
      })

      type IncomingPkg = { name: string; version: string; rawVersion: string; ecosystem: string; source: string; location: string | null; direct: boolean | null; deps: string[] }
      const { toCreate, toUpdateMeta, toDelete, supersededVersions } = diffPackages(
        existingPkgs,
        incomingPackages as IncomingPkg[]
      )

      const historyEntries: {
        packageName: string
        ecosystem: string
        action: string
        oldVersion?: string
        newVersion?: string
      }[] = [
        ...toCreate.map(p => ({ packageName: p.name, ecosystem: p.ecosystem, action: "added", newVersion: p.version })),
        ...toDelete.map(p => ({ packageName: p.name, ecosystem: p.ecosystem, action: "removed", oldVersion: p.version })),
      ]

      // Matched rows keep their identity; only the mutable metadata can differ
      // (e.g. re-import after a collector fix filled in deps).
      const metaChanged = toUpdateMeta.filter(({ existing: ex, incoming: inc }) =>
        ex.direct !== inc.direct ||
        ex.location !== inc.location ||
        ex.rawVersion !== inc.rawVersion ||
        JSON.stringify(ex.deps) !== JSON.stringify(inc.deps ?? [])
      )

      // Execute all package changes + history in one transaction
      await prisma.$transaction([
        prisma.package.deleteMany({ where: { id: { in: toDelete.map(p => p.id) } } }),
        ...toCreate.map((p: IncomingPkg) =>
          prisma.package.create({ data: { assetId: existing.id, ...p, deps: p.deps ?? [] } })
        ),
        ...metaChanged.map(({ existing: ex, incoming: inc }) =>
          prisma.package.update({
            where: { id: ex.id },
            data: { rawVersion: inc.rawVersion, location: inc.location, direct: inc.direct, deps: inc.deps ?? [] },
          })
        ),
        ...(historyEntries.length > 0
          ? [prisma.packageHistory.createMany({
              data: historyEntries.map(h => ({ assetId: existing.id, ...h })),
            })]
          : []),
      ])

      // Auto-resolve alerts raised against versions that are no longer installed
      // while the package itself remains. Pairing an old version to a specific new
      // one is not possible in general (both versions of a co-installed package can
      // move at once), and is not needed: what makes the alert stale is simply that
      // its version is gone.
      for (const superseded of supersededVersions) {
        const resolveReason = `Auto-resolved: ${superseded.version} no longer installed (now ${superseded.remainingVersions.join(", ")})`
        const alertsToResolve = await prisma.alert.findMany({
          where: {
            assetId: existing.id,
            packageName: superseded.name,
            packageVersion: superseded.version,
            ecosystem: superseded.ecosystem,
            status: { in: ["open", "in_progress"] },
          },
          select: { id: true, status: true },
        })
        for (const alert of alertsToResolve) {
          await prisma.alert.update({
            where: { id: alert.id },
            data: { status: "resolved", resolvedAt: new Date(), resolveReason },
          })
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              type: "status_changed",
              data: { from: alert.status, to: "resolved", reason: resolveReason },
            },
          })
        }
      }

      const asset = await prisma.asset.update({
        where: { id: existing.id },
        data: {
          name: name ?? hostname,
          assetType,
          osId: inventory.os?.id ?? "unknown",
          osVersionId: inventory.os?.versionId ?? "unknown",
          osName: inventory.os?.name ?? "Unknown",
          scannedAt: inventory.scannedAt ? new Date(inventory.scannedAt) : null,
        },
      })
      await createAuditLog({
        userId: session.user.id, userEmail: session.user.email,
        action: "asset_imported", target: asset.name || hostname,
        detail: `packages: ${incomingPackages.length} (added: ${toCreate.length}, removed: ${toDelete.length}, superseded: ${supersededVersions.length})`,
      })
      return NextResponse.json({ ...asset, updated: true }, { status: 200 })
    }

    // New asset
    const asset = await prisma.asset.create({
      data: {
        name: name ?? hostname,
        hostname,
        assetType,
        osId: inventory.os?.id ?? "unknown",
        osVersionId: inventory.os?.versionId ?? "unknown",
        osName: inventory.os?.name ?? "Unknown",
        scannedAt: inventory.scannedAt ? new Date(inventory.scannedAt) : null,
        packages: { create: incomingPackages },
      },
    })

    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "asset_imported", target: asset.name || hostname,
      detail: `packages: ${incomingPackages.length}`,
    })
    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    logger.warn("failed to create asset", { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 })
  }
}

type CycloneDXComponent = {
  name?: string
  version?: string
  purl?: string
  properties?: { name: string; value: string }[]
}

type CycloneDXDependency = {
  ref: string
  dependsOn?: string[]    // CycloneDX 1.6 field name
  dependencies?: string[] // fallback for older format
}

type CycloneDXBom = {
  metadata?: { component?: { name?: string; version?: string; type?: string; purl?: string }; timestamp?: string }
  components?: CycloneDXComponent[]
  dependencies?: CycloneDXDependency[]
}

// Maps PURL type strings to OSV canonical ecosystem names
const PURL_TYPE_MAP: Record<string, string> = {
  golang:   "Go",
  composer: "Packagist",
  pypi:     "PyPI",
  maven:    "Maven",
  nuget:    "NuGet",
  gem:      "RubyGems",
}

function distroQualifierToEcosystem(distro: string): string {
  // distro format: "{id}-{version}" e.g. "almalinux-9", "ubuntu-22.04", "alpine-3.18"
  const lastDash = distro.lastIndexOf("-")
  if (lastDash === -1) return ""
  const id = distro.slice(0, lastDash)
  const ver = distro.slice(lastDash + 1)
  switch (id) {
    case "almalinux":   return `AlmaLinux:${ver}`
    case "ubuntu":      return `Ubuntu:${ver}:LTS`
    case "debian":      return `Debian:${ver}`
    case "alpine":      return `Alpine:v${ver}`
    case "rocky":       return `Rocky:${ver}`
    case "oraclelinux": return "oracle-linux"
    case "rhel":        return `Red Hat:${ver}`
    case "centos":      return `CentOS:${ver}`
    default:            return ""
  }
}

function parsePURL(purl: string | undefined): { ecosystem: string; name: string | undefined } {
  if (!purl) return { ecosystem: "unknown", name: undefined }
  // Capture TYPE, full PATH (may contain '/'), and optional qualifiers after @version
  const match = purl.match(/^pkg:(\w+)\/([^@?#]+)@[^?#]*(?:\?([^#]*))?/)
  if (!match) return { ecosystem: "unknown", name: undefined }
  const [, type, fullPath, qualifierStr] = match

  // Parse qualifiers: "distro=almalinux-9&arch=x86_64" → { distro: "almalinux-9" }
  const qualifiers: Record<string, string> = {}
  if (qualifierStr) {
    for (const kv of qualifierStr.split("&")) {
      const eq = kv.indexOf("=")
      if (eq > 0) qualifiers[kv.slice(0, eq)] = kv.slice(eq + 1)
    }
  }

  const osTypes = ["rpm", "deb", "apk"]

  if (osTypes.includes(type)) {
    // OS packages: first path segment is distro namespace, remainder is package name
    // e.g. pkg:apk/alpine/curl?distro=alpine-3.18 → ecosystem="Alpine:v3.18", name="curl"
    const slashIdx = fullPath.indexOf("/")
    const name = slashIdx === -1
      ? decodeURIComponent(fullPath)
      : decodeURIComponent(fullPath.slice(slashIdx + 1))
    // Use distro qualifier (set by heretix-cli) for precise OSV ecosystem matching.
    // Without the qualifier, fall back to empty so heretix-api does a cross-ecosystem search.
    const ecosystem = qualifiers["distro"] ? distroQualifierToEcosystem(qualifiers["distro"]) : ""
    return { ecosystem, name }
  }

  // Non-OS packages: last path segment is name, everything before is namespace.
  // Handles scoped npm  : pkg:npm/%40auth/core       → @auth/core
  // Handles Go modules  : pkg:golang/github.com/x/net → github.com/x/net
  // Handles simple pkgs : pkg:npm/lodash              → lodash
  const lastSlash = fullPath.lastIndexOf("/")
  const ecosystem = PURL_TYPE_MAP[type] ?? type
  if (lastSlash === -1) {
    return { ecosystem, name: decodeURIComponent(fullPath) }
  }
  const name = decodeURIComponent(fullPath.slice(0, lastSlash)) + "/" + decodeURIComponent(fullPath.slice(lastSlash + 1))
  return { ecosystem, name }
}

function convertCycloneDXToInventory(bom: CycloneDXBom) {
  const hostname = bom.metadata?.component?.name ?? "unknown"
  const osName = bom.metadata?.component?.version ?? ""

  // Build a PURL → deps map from the bom.dependencies section.
  // CycloneDX 1.6 uses "dependsOn"; older tooling may use "dependencies".
  const depsMap = new Map<string, string[]>()
  for (const dep of bom.dependencies ?? []) {
    const depList = dep.dependsOn ?? dep.dependencies ?? []
    if (dep.ref && depList.length) {
      depsMap.set(dep.ref, depList)
    }
  }

  // Build set of direct dependency PURLs from the root component entry in dependencies.
  // Used as fallback when cdx:direct property is absent (SBOMs from Syft, trivy, cdxgen, etc.)
  const rootPurl = bom.metadata?.component?.purl
  const rootDirectPurls = new Set<string>(rootPurl ? (depsMap.get(rootPurl) ?? []) : [])

  const packages = (bom.components ?? []).map((c: CycloneDXComponent) => {
    const { ecosystem, name } = parsePURL(c.purl)
    const directProp = c.properties?.find(p => p.name === "cdx:direct")
    let direct: boolean | null
    if (directProp) {
      direct = directProp.value === "true"
    } else if (rootDirectPurls.size > 0 && c.purl) {
      direct = rootDirectPurls.has(c.purl)
    } else {
      direct = null
    }
    const deps = c.purl ? (depsMap.get(c.purl) ?? []) : []
    return {
      name: name ?? c.name ?? "",
      version: c.version ?? "",
      rawVersion: c.version ?? "",
      ecosystem,
      source: "sbom",
      location: null,
      direct,
      deps,
    }
  }).filter(p => p.name !== "")

  const type = bom.metadata?.component?.type === "container" ? "docker_image" : "host"

  return {
    version: "1.0",
    hostname,
    type,
    scannedAt: bom.metadata?.timestamp ?? new Date().toISOString(),
    os: { id: "", versionId: "", name: osName },
    packages,
  }
}
