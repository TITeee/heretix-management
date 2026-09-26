import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { diffPackages } from "@/lib/package-diff"
import { carryForwardAlerts } from "@/lib/alerts"
import { PURL_TYPE_MAP } from "@/lib/purl"
import { convertCycloneDXToInventory } from "@/lib/cyclonedx"
import { withApiErrorHandling } from "@/lib/api-handler"

export const GET = withApiErrorHandling("assets.list", async (req: NextRequest) => {
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
})

export const POST = withApiErrorHandling("assets.create", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  // Guards blank as well as missing: "" is truthy-adjacent enough (a string) that
  // `?? "unknown"` alone would let it through, and hostname is now @unique — two
  // imports that both resolve to "" would collide on that constraint instead of
  // on the deliberate "unknown" placeholder every caller already expects.
  const hostname = (typeof inventory.hostname === "string" && inventory.hostname.trim()) || "unknown"
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
    category?: string | null
    sourcePackage?: string | null
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
    category: p.category ?? null,
    sourcePackage: p.sourcePackage ?? null,
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

    type IncomingPkg = { name: string; version: string; rawVersion: string; ecosystem: string; source: string; location: string | null; direct: boolean | null; deps: string[]; scope: string | null; category: string | null; sourcePackage: string | null }
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
      ex.category !== inc.category ||
      ex.sourcePackage !== inc.sourcePackage ||
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
          data: { rawVersion: inc.rawVersion, location: inc.location, direct: inc.direct, deps: inc.deps ?? [], scope: inc.scope, category: inc.category, sourcePackage: inc.sourcePackage },
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
})
