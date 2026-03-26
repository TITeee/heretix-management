import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

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
    const { name, inventory, hostname: simpleHostname, assetType: simpleAssetType } = body

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
    }) => ({
      name: p.name,
      version: p.version,
      rawVersion: p.rawVersion,
      ecosystem: p.ecosystem,
      source: p.source,
      location: p.location ?? null,
    }))

    const existing = await prisma.asset.findFirst({ where: { hostname } })

    if (existing) {
      // Diff-based update: compare by (name, ecosystem)
      const existingPkgs = await prisma.package.findMany({
        where: { assetId: existing.id, source: { not: "manual" } },
      })

      const existingMap = new Map(existingPkgs.map(p => [`${p.name}::${p.ecosystem}`, p]))
      type IncomingPkg = { name: string; version: string; rawVersion: string; ecosystem: string; source: string; location: string | null }
      const incomingMap = new Map<string, IncomingPkg>(
        incomingPackages.map((p: IncomingPkg) => [`${p.name}::${p.ecosystem}`, p])
      )

      const toCreate: typeof incomingPackages = []
      const toUpdate: { id: string; version: string; rawVersion: string; location: string | null }[] = []
      const toDelete: string[] = []
      const historyEntries: {
        packageName: string
        ecosystem: string
        action: string
        oldVersion?: string
        newVersion?: string
      }[] = []

      for (const [key, incoming] of incomingMap) {
        const exPkg = existingMap.get(key)
        if (!exPkg) {
          toCreate.push(incoming)
          historyEntries.push({ packageName: incoming.name, ecosystem: incoming.ecosystem, action: "added", newVersion: incoming.version })
        } else if (exPkg.version !== incoming.version) {
          toUpdate.push({ id: exPkg.id, version: incoming.version, rawVersion: incoming.rawVersion, location: incoming.location })
          historyEntries.push({ packageName: incoming.name, ecosystem: incoming.ecosystem, action: "updated", oldVersion: exPkg.version, newVersion: incoming.version })
        }
        // unchanged: skip
      }

      for (const [key, exPkg] of existingMap) {
        if (!incomingMap.has(key)) {
          toDelete.push(exPkg.id)
          historyEntries.push({ packageName: exPkg.name, ecosystem: exPkg.ecosystem, action: "removed", oldVersion: exPkg.version })
        }
      }

      // Execute all package changes + history in one transaction
      await prisma.$transaction([
        prisma.package.deleteMany({ where: { id: { in: toDelete } } }),
        ...toCreate.map((p: { name: string; version: string; rawVersion: string; ecosystem: string; source: string; location: string | null }) =>
          prisma.package.create({ data: { assetId: existing.id, ...p } })
        ),
        ...toUpdate.map(({ id, version, rawVersion, location }) =>
          prisma.package.update({ where: { id }, data: { version, rawVersion, location } })
        ),
        ...(historyEntries.length > 0
          ? [prisma.packageHistory.createMany({
              data: historyEntries.map(h => ({ assetId: existing.id, ...h })),
            })]
          : []),
      ])

      // Auto-resolve alerts for upgraded packages
      const upgraded = historyEntries.filter(h => h.action === "updated")
      for (const pkg of upgraded) {
        await prisma.alert.updateMany({
          where: {
            assetId: existing.id,
            packageName: pkg.packageName,
            packageVersion: pkg.oldVersion,
            ecosystem: pkg.ecosystem,
            status: { in: ["open", "in_progress"] },
          },
          data: {
            status: "resolved",
            resolvedAt: new Date(),
            resolveReason: `Auto-resolved: package upgraded from ${pkg.oldVersion} to ${pkg.newVersion}`,
          },
        })
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

    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 })
  }
}
