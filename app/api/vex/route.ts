import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

// Reverse-maps from OSV ecosystem name to PURL type + namespace
function buildPURL(name: string, version: string, ecosystem: string): string {
  const encoded = name.startsWith("@")
    ? (() => { const [scope, pkg] = name.slice(1).split("/"); return `%40${scope}/${pkg}` })()
    : name

  if (ecosystem === "npm")       return `pkg:npm/${encoded}@${version}`
  if (ecosystem === "PyPI")      return `pkg:pypi/${name}@${version}`
  if (ecosystem === "Go")        return `pkg:golang/${name}@${version}`
  if (ecosystem === "Maven")     return `pkg:maven/${name}@${version}`
  if (ecosystem === "NuGet")     return `pkg:nuget/${name}@${version}`
  if (ecosystem === "RubyGems")  return `pkg:gem/${name}@${version}`
  if (ecosystem === "Packagist") return `pkg:composer/${name}@${version}`

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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get("assetId") ?? undefined
  const download = searchParams.get("download") === "true"

  // Only export not_affected: alerts explicitly judged as non-exploitable with a justification.
  // resolved (package upgraded) and in_progress do not map cleanly to VEX fixed/under_investigation
  // because heretix resolved = "we upgraded the package", not "this version was patched".
  const alerts = await prisma.alert.findMany({
    where: {
      status: "ignored",
      vexJustification: { not: null },
      ...(assetId ? { assetId } : {}),
    },
    select: {
      externalId: true,
      packageName: true,
      packageVersion: true,
      ecosystem: true,
      vexJustification: true,
      notes: true,
    },
    orderBy: { externalId: "asc" },
  })

  // Deduplicate by (externalId, PURL)
  const seen = new Set<string>()
  const vulnerabilities: object[] = []

  for (const alert of alerts) {
    const purl = buildPURL(alert.packageName, alert.packageVersion, alert.ecosystem)
    const key = `${alert.externalId}::${purl}`
    if (seen.has(key)) continue
    seen.add(key)

    vulnerabilities.push({
      id: alert.externalId,
      affects: [{ ref: purl }],
      analysis: {
        state: "not_affected",
        justification: alert.vexJustification,
        ...(alert.notes?.trim() ? { detail: alert.notes.trim() } : {}),
      },
    })
  }

  const vex = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "heretix", name: "heretix-management" }],
    },
    vulnerabilities: vulnerabilities.map(v => ({ "bom-ref": (v as { id: string }).id, ...v })),
  }

  const body = JSON.stringify(vex, null, 2)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (download) {
    let filename = "vex.json"
    if (assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true } })
      const assetName = (asset?.name || asset?.hostname || assetId).replace(/[^a-zA-Z0-9_\-]/g, "_")
      filename = `vex-${assetName}.json`
    }
    headers["Content-Disposition"] = `attachment; filename="${filename}"`
  }

  return new NextResponse(body, { headers })
}
