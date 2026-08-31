import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { EXPORTABLE_REASONS, vexStateFor } from "@/lib/vex"
import { findCpeForCve } from "@/lib/heretix-api"

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

function componentType(purl: string): string {
  if (purl.startsWith("pkg:deb/") || purl.startsWith("pkg:rpm/") || purl.startsWith("pkg:apk/")) return "operating-system"
  return "application"
}

type VexComponent = {
  "bom-ref": string
  type: string
  name: string
  version: string
  purl: string
  cpe?: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get("assetId") ?? undefined
  const download = searchParams.get("download") === "true"

  const asset = assetId
    ? await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true, assetType: true } })
    : null

  // Only ignored alerts produce statements. resolved (package upgraded) and
  // in_progress do not map cleanly to VEX fixed/under_investigation because
  // heretix resolved = "we upgraded the package", not "this version was patched".
  //
  // Which ignore reasons are exportable, and why accepted_risk is withheld, is
  // documented in lib/vex.ts.
  const alerts = await prisma.alert.findMany({
    where: {
      status: "ignored",
      ...(assetId ? { assetId } : {}),
      OR: [
        { ignoreReason: { in: EXPORTABLE_REASONS } },
        // Rows written before ignoreReason existed: a justification meant not_affected.
        { ignoreReason: null, vexJustification: { not: null } },
      ],
    },
    select: {
      externalId: true,
      packageName: true,
      packageVersion: true,
      ecosystem: true,
      ignoreReason: true,
      vexJustification: true,
      notes: true,
    },
    orderBy: { externalId: "asc" },
  })

  // Deduplicate by (externalId, PURL). affects[].ref points at a component's
  // bom-ref (the purl itself, which is unique per component here) rather than
  // a bare purl string, so the reference actually resolves within the document.
  const seen = new Set<string>()
  const components = new Map<string, VexComponent>()
  const vulnerabilities: object[] = []

  for (const alert of alerts) {
    const state = vexStateFor(alert)
    if (!state) continue

    const purl = buildPURL(alert.packageName, alert.packageVersion, alert.ecosystem)
    const key = `${alert.externalId}::${purl}`
    if (seen.has(key)) continue
    seen.add(key)

    if (!components.has(purl)) {
      components.set(purl, {
        "bom-ref": purl,
        type: componentType(purl),
        name: alert.packageName,
        version: alert.packageVersion,
        purl,
      })
    }

    vulnerabilities.push({
      id: alert.externalId,
      affects: [{ ref: purl }],
      analysis: {
        state,
        // justification is only defined for not_affected in the CycloneDX schema.
        ...(state === "not_affected" ? { justification: alert.vexJustification } : {}),
        ...(alert.notes?.trim() ? { detail: alert.notes.trim() } : {}),
      },
    })
  }

  // A "pkg:generic/..." purl (vendor appliances like PAN-OS/BIG-IP — anything
  // outside a real package ecosystem) carries no identity a third party can
  // resolve. Try to recover the CPE vendor:product NVD's own analysts already
  // assigned to this exact CVE/product instead of guessing one. Cached per
  // product (by whichever alert is encountered first for it) rather than
  // retried across every one of that product's CVEs — cheaper, and in
  // practice a PSIRT bulletin's CVEs against the same product/version tend to
  // get analyzed by NVD together, so the first attempt is usually enough.
  const cpeAttempted = new Set<string>()
  for (const alert of alerts) {
    const purl = buildPURL(alert.packageName, alert.packageVersion, alert.ecosystem)
    const component = components.get(purl)
    if (!component || !purl.startsWith("pkg:generic/")) continue

    const cacheKey = alert.packageName.toLowerCase()
    if (cpeAttempted.has(cacheKey)) continue
    cpeAttempted.add(cacheKey)

    const match = await findCpeForCve(alert.externalId, alert.packageName).catch(() => null)
    if (match) {
      for (const c of components.values()) {
        if (c.name.toLowerCase() === cacheKey) c.cpe = match.cpe
      }
    }
  }

  const vex = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "heretix", name: "heretix-management" }],
      // Identifies which asset this document's statements apply to. Not a
      // resolvable product identity (name/hostname are operational labels,
      // not vendor/product) — that's carried per-package by components[].cpe
      // above when available.
      ...(asset ? { component: { type: asset.assetType === "docker_image" ? "container" : "application", name: asset.name || asset.hostname } } : {}),
    },
    components: [...components.values()],
    vulnerabilities: vulnerabilities.map(v => ({ "bom-ref": (v as { id: string }).id, ...v })),
  }

  const body = JSON.stringify(vex, null, 2)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (download) {
    let filename = "vex.json"
    if (assetId) {
      const assetName = (asset?.name || asset?.hostname || assetId).replace(/[^a-zA-Z0-9_\-]/g, "_")
      filename = `vex-${assetName}.json`
    }
    headers["Content-Disposition"] = `attachment; filename="${filename}"`
  }

  return new NextResponse(body, { headers })
}
