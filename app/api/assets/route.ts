import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { diffPackages } from "@/lib/package-diff"
import { carryForwardAlerts } from "@/lib/alerts"
import { buildPURL } from "@/lib/purl"

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
      scope?: string | null
    }) => ({
      name: p.name,
      version: p.version,
      rawVersion: p.rawVersion,
      ecosystem: PURL_TYPE_MAP[p.ecosystem] ?? p.ecosystem,
      source: p.source,
      location: p.location ?? null,
      direct: p.direct ?? null,
      deps: p.deps ?? [],
      scope: p.scope ?? null,
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
          // Upgrades are a subset of the removals, surfaced separately because those
          // are the ones whose open alerts follow the package to its new version.
          superseded: supersededVersions.filter((s) => s.successor).length,
        },
      })
    }

    if (existing) {
      const existingPkgs = await prisma.package.findMany({
        where: { assetId: existing.id, source: { not: "manual" } },
      })

      type IncomingPkg = { name: string; version: string; rawVersion: string; ecosystem: string; source: string; location: string | null; direct: boolean | null; deps: string[]; scope: string | null }
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
        ex.scope !== inc.scope ||
        JSON.stringify(ex.deps) !== JSON.stringify(inc.deps ?? [])
      )

      // Execute all package changes + history in one transaction.
      // A full re-import of a large asset touches every package row (hundreds of
      // individual create/update/delete statements, since Prisma has no bulk
      // upsert), which can run past the default 5s transaction timeout — that
      // showed up as an opaque "Failed to create asset" on a big asset's re-import.
      await prisma.$transaction([
        prisma.package.deleteMany({ where: { id: { in: toDelete.map(p => p.id) } } }),
        ...toCreate.map((p: IncomingPkg) =>
          prisma.package.create({ data: { assetId: existing.id, ...p, deps: p.deps ?? [] } })
        ),
        ...metaChanged.map(({ existing: ex, incoming: inc }) =>
          prisma.package.update({
            where: { id: ex.id },
            data: { rawVersion: inc.rawVersion, location: inc.location, direct: inc.direct, deps: inc.deps ?? [], scope: inc.scope },
          })
        ),
        ...(historyEntries.length > 0
          ? [prisma.packageHistory.createMany({
              data: historyEntries.map(h => ({ assetId: existing.id, ...h })),
            })]
          : []),
      ], { timeout: 60_000, maxWait: 15_000 })

      // Carry the alerts of an upgraded package over to the version that replaced it,
      // so a finding that survives the upgrade stays the same alert instead of being
      // closed here and raised again as a new one. Whether it survives is not decided
      // here: the next scan asks heretix-api and closes the ones it no longer reports.
      for (const superseded of supersededVersions) {
        if (!superseded.successor) continue
        await carryForwardAlerts(
          {
            assetId: existing.id,
            name: superseded.name,
            version: superseded.version,
            ecosystem: superseded.ecosystem,
          },
          {
            assetId: existing.id,
            name: superseded.name,
            version: superseded.successor,
            ecosystem: superseded.ecosystem,
          }
        )
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
          sbomTool: inventory.sbomTool ?? null,
        },
      })
      await createAuditLog({
        userId: session.user.id, userEmail: session.user.email,
        action: "asset_imported", target: asset.name || hostname,
        detail: `packages: ${incomingPackages.length} (added: ${toCreate.length}, removed: ${toDelete.length}, upgraded: ${supersededVersions.filter((s) => s.successor).length})`,
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
        sbomTool: inventory.sbomTool ?? null,
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
  "bom-ref"?: string
  type?: string
  name?: string
  version?: string
  description?: string
  purl?: string
  scope?: string
  properties?: { name: string; value: string }[]
}

// bom.dependencies cross-references components by bom-ref, not purl — the two
// are usually identical (heretix-cli always sets bom-ref = purl), but a scanner
// is free to make them differ. Syft does exactly that to disambiguate same-purl
// components: bom-ref carries an internal "package-id" query param that purl
// doesn't, so joining on purl silently finds nothing and every package looks
// dependency-free.
function componentRef(c: { "bom-ref"?: string; purl?: string }): string | undefined {
  return c["bom-ref"] ?? c.purl
}

/**
 * CycloneDX component types that describe something other than an installed
 * package, and so must not become Package rows.
 *
 * Scanners put more than packages in `components`: Syft's container scan emits a
 * "file" entry per file in the image and an "operating-system" entry for the
 * distro itself, neither of which carries a purl. Left in, the file entries fill
 * the Packages tab with paths, and the operating-system entry — which does have a
 * version — gets sent to heretix-api as a package named e.g. "alpine", inviting
 * matches against something unrelated.
 *
 * An allowlist would be the wrong shape here: "library" covers most of what
 * scanners emit, but cdxgen also types entries as "framework", and a scanner is
 * free to use "application" for a packaged app. Excluding only what is definitely
 * not a package keeps an unfamiliar type from being silently dropped.
 */
const NON_PACKAGE_COMPONENT_TYPES = new Set([
  "file",
  "operating-system",
  "container",
  "device",
  "firmware",
  "platform",
  "device-driver",
  "machine-learning-model",
  "data",
  "cryptographic-asset",
])

type CycloneDXDependency = {
  ref: string
  dependsOn?: string[]    // CycloneDX 1.6 field name
  dependencies?: string[] // fallback for older format
}

type CycloneDXTool = { vendor?: string; author?: string; name?: string; version?: string }

type CycloneDXBom = {
  metadata?: {
    component?: { "bom-ref"?: string; name?: string; version?: string; type?: string; purl?: string }
    timestamp?: string
    // CycloneDX <1.5 (heretix-cli): a flat array. 1.5+ (Syft, Trivy, cdxgen): wrapped in `components`.
    tools?: CycloneDXTool[] | { components?: CycloneDXTool[] }
  }
  components?: CycloneDXComponent[]
  dependencies?: CycloneDXDependency[]
}

// Returns "name version" (or just "name") for the first tool listed in
// metadata.tools, in whichever of the two CycloneDX shapes it comes in.
function extractSbomTool(bom: CycloneDXBom): string | null {
  const tools = bom.metadata?.tools
  if (!tools) return null
  const list = Array.isArray(tools) ? tools : (tools.components ?? [])
  const name = list[0]?.name
  if (!name) return null
  const version = list[0]?.version
  return version ? `${name} ${version}` : name
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
  // Legacy heretix-cli builds (2026 to 2026-09-01) emitted the bare, version-less
  // "oracle-linux" qualifier — heretix-api's AdvisoryAffectedProduct lookup had no
  // per-OS-major-version column at the time, so a version segment here would have
  // been discarded server-side anyway. Current builds emit "oraclelinux-<major>",
  // handled by the generic split below now that heretix-api keys vendor by version
  // (2026-09-01). Checked before that split, which would otherwise misparse the
  // hyphen inside "oracle-linux" itself as the id/version boundary (id="oracle",
  // ver="linux") and silently fall through to "".
  if (distro === "oracle-linux") return "oracle-linux"

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
    // Current heretix-cli builds emit "rockylinux-<major>" (from ecosystem
    // "Rocky Linux:N", normalized by stripping the space). "rocky-<major>" is
    // the legacy qualifier from before 2026-09-01, when heretix-cli sent the
    // ecosystem as "Rocky:N" — a value that never matched anything in
    // heretix-api's OSV data (the real ecosystem string is "Rocky Linux:N").
    // Both map to the same corrected ecosystem; kept for SBOMs from that window.
    case "rockylinux":  return `Rocky Linux:${ver}`
    case "rocky":       return `Rocky Linux:${ver}`
    // "oraclelinux-<major>" is heretix-cli's current, version-qualified form
    // (restored 2026-09-01 now that heretix-api keys vendor by version — see the
    // bare "oracle-linux" case above for the version-less form it replaced).
    case "oraclelinux": return `Oracle Linux:${ver}`
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

  // Prefer an explicit "operating-system" component (Syft, Trivy, and cdxgen all
  // emit one) for OS info. metadata.component.version describes the scanned
  // artifact itself, not its OS — e.g. Syft sets it to a Bitnami image's own
  // version ("10" for bitnami/drupal:10), which isn't the OS at all. heretix-cli's
  // own SBOMs are the exception: they carry no operating-system component and put
  // the OS name in metadata.component.version instead, so that's the fallback.
  const osComponent = (bom.components ?? []).find((c: CycloneDXComponent) => c.type === "operating-system")
  const osId = osComponent?.name ?? ""
  const osVersionId = osComponent?.version ?? ""
  const osName = osComponent
    ? (osComponent.description || `${osComponent.name ?? ""} ${osComponent.version ?? ""}`.trim())
    : (bom.metadata?.component?.version ?? "")

  // Build a ref → deps map from the bom.dependencies section.
  // CycloneDX 1.6 uses "dependsOn"; older tooling may use "dependencies".
  const depsMap = new Map<string, string[]>()
  for (const dep of bom.dependencies ?? []) {
    const depList = dep.dependsOn ?? dep.dependencies ?? []
    if (dep.ref && depList.length) {
      depsMap.set(dep.ref, depList)
    }
  }

  // dependsOn entries are refs too, so resolve each one back to a normalized,
  // qualifier-free PURL — built the same way (buildPURL) the dependency graph
  // reconstructs one from a Package row's name/version/ecosystem. The
  // component's own raw purl won't do: OS packages carry distro/arch/upstream
  // qualifiers Package rows don't store, so a raw-purl match would silently
  // fail there exactly like the unresolved ref did.
  const refToPurl = new Map<string, string>()
  for (const c of bom.components ?? []) {
    const ref = componentRef(c)
    if (!ref || !c.purl) continue
    const { ecosystem, name } = parsePURL(c.purl)
    if (!name) continue
    refToPurl.set(ref, buildPURL(name, c.version ?? "", ecosystem))
  }

  // Build set of direct dependency refs from the root component entry in dependencies.
  // Used as fallback when cdx:direct property is absent (SBOMs from Syft, trivy, cdxgen, etc.)
  const rootRef = bom.metadata?.component ? componentRef(bom.metadata.component) : undefined
  const rootDirectRefs = new Set<string>(rootRef ? (depsMap.get(rootRef) ?? []) : [])

  const seenPackageKeys = new Set<string>()
  const packages = (bom.components ?? []).filter((c: CycloneDXComponent) => {
    if (c.type && NON_PACKAGE_COMPONENT_TYPES.has(c.type)) return false
    // No purl and no version is not something a vulnerability lookup can act on;
    // it is a component the scanner listed for provenance, not an installed package.
    return !!c.purl || !!c.version
  }).map((c: CycloneDXComponent) => {
    const { ecosystem, name } = parsePURL(c.purl)
    const ref = componentRef(c)
    const directProp = c.properties?.find(p => p.name === "cdx:direct")
    let direct: boolean | null
    if (directProp) {
      direct = directProp.value === "true"
    } else if (rootDirectRefs.size > 0 && ref) {
      direct = rootDirectRefs.has(ref)
    } else {
      direct = null
    }
    const deps = ref
      ? (depsMap.get(ref) ?? []).map(depRef => refToPurl.get(depRef) ?? depRef)
      : []
    return {
      name: name ?? c.name ?? "",
      version: c.version ?? "",
      rawVersion: c.version ?? "",
      ecosystem,
      source: "sbom",
      location: null,
      direct,
      deps,
      scope: c.scope === "excluded" ? "excluded" : null,
    }
  }).filter(p => p.name !== "").filter(p => {
    // Some scanners (Syft on Bitnami images, for one) report the same package
    // twice — via different catalogers — with byte-identical purls. Package
    // rows are unique per (assetId, name, version, ecosystem), so an
    // unfiltered duplicate breaks the nested create on a brand-new asset,
    // while an existing asset's diff silently absorbs it (incoming packages
    // are keyed through a Map there). Dedupe here so both paths agree.
    const key = `${p.ecosystem}::${p.name}::${p.version}`
    if (seenPackageKeys.has(key)) return false
    seenPackageKeys.add(key)
    return true
  })

  const type = bom.metadata?.component?.type === "container" ? "docker_image" : "host"

  return {
    version: "1.0",
    hostname,
    type,
    scannedAt: bom.metadata?.timestamp ?? new Date().toISOString(),
    os: { id: osId, versionId: osVersionId, name: osName },
    sbomTool: extractSbomTool(bom),
    packages,
  }
}
