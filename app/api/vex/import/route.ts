import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

const PURL_TYPE_MAP: Record<string, string> = {
  golang: "Go", composer: "Packagist", pypi: "PyPI",
  maven: "Maven", nuget: "NuGet", gem: "RubyGems",
}

function distroQualifierToEcosystem(distro: string): string {
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

/**
 * The version is optional: CycloneDX lets a statement carry it inline
 * (`pkg:npm/lodash@4.17.20`) or list versions separately under
 * `affects[].versions[]`, in which case `ref` is a bare PURL.
 */
function parsePURL(purl: string): { ecosystem: string; name: string; version: string | null } | null {
  // Capture TYPE, PATH, optional VERSION, and optional qualifiers
  const match = purl.match(/^pkg:(\w+)\/([^@?#]+)(?:@([^?#]*))?(?:\?([^#]*))?/)
  if (!match) return null
  const [, type, fullPath, version, qualifierStr] = match

  const qualifiers: Record<string, string> = {}
  if (qualifierStr) {
    for (const kv of qualifierStr.split("&")) {
      const eq = kv.indexOf("=")
      if (eq > 0) qualifiers[kv.slice(0, eq)] = kv.slice(eq + 1)
    }
  }

  const osTypes = ["rpm", "deb", "apk"]
  if (osTypes.includes(type)) {
    const slashIdx = fullPath.indexOf("/")
    const name = slashIdx === -1
      ? decodeURIComponent(fullPath)
      : decodeURIComponent(fullPath.slice(slashIdx + 1))
    const ecosystem = qualifiers["distro"] ? distroQualifierToEcosystem(qualifiers["distro"]) : ""
    return { ecosystem, name, version: version ?? null }
  }

  const lastSlash = fullPath.lastIndexOf("/")
  const ecosystem = PURL_TYPE_MAP[type] ?? type
  if (lastSlash === -1) {
    return { ecosystem, name: decodeURIComponent(fullPath), version: version ?? null }
  }
  const name = decodeURIComponent(fullPath.slice(0, lastSlash)) + "/" + decodeURIComponent(fullPath.slice(lastSlash + 1))
  return { ecosystem, name, version: version ?? null }
}

type VexVersionEntry = {
  version?: string
  range?: string
  status?: string
}

type VexEntry = {
  id?: string
  affects?: { ref?: string; versions?: VexVersionEntry[] }[]
  analysis?: { state?: string; justification?: string; detail?: string }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  if (body.bomFormat !== "CycloneDX") {
    return NextResponse.json({ error: "Only CycloneDX VEX format is supported" }, { status: 400 })
  }

  const vulnerabilities: VexEntry[] = body.vulnerabilities ?? []
  const source: string = body.serialNumber ?? "imported"

  let applied = 0, skipped = 0, notFound = 0, unsupportedRange = 0

  for (const vuln of vulnerabilities) {
    const cveId = vuln.id
    const state = vuln.analysis?.state
    const justification = vuln.analysis?.justification ?? null

    // Skip: no ID, no state, or "affected" (default assumption, not actionable)
    if (!cveId || !state || state === "affected") { skipped++; continue }

    // Map VEX state → heretix status + ignore reason. false_positive must be
    // handled here or a document produced by our own exporter would lose those
    // statements on re-import.
    let newStatus: string
    let newIgnoreReason: string | null = null
    switch (state) {
      case "not_affected":        newStatus = "ignored"; newIgnoreReason = "not_affected"; break
      case "false_positive":      newStatus = "ignored"; newIgnoreReason = "false_positive"; break
      case "fixed":               newStatus = "resolved"; break
      case "under_investigation": newStatus = "in_progress"; break
      default:                    skipped++; continue
    }

    const newVexJustification = state === "not_affected" ? justification : null

    // not_affected without a justification cannot be represented, and would be
    // rejected by our own PATCH validation; treat it as unusable rather than
    // storing an ignore decision that the exporter would then drop.
    if (state === "not_affected" && !justification) { skipped++; continue }

    for (const affect of vuln.affects ?? []) {
      if (!affect.ref) { skipped++; continue }

      const parsed = parsePURL(affect.ref)
      if (!parsed) { skipped++; continue }

      // The affected versions live either inline in the PURL or, as vendor
      // documents overwhelmingly do, enumerated under affects[].versions[].
      // Only exact versions are matched; `range` uses the VERS syntax, which
      // needs per-ecosystem comparison to evaluate and is reported rather than
      // guessed at, since a wrong guess would silently suppress a real finding.
      const versions: string[] = []
      if (affect.versions?.length) {
        for (const v of affect.versions) {
          // status defaults to "affected" when omitted
          if (v.status && v.status !== "affected") { skipped++; continue }
          if (v.version) { versions.push(v.version); continue }
          if (v.range) { unsupportedRange++; continue }
          skipped++
        }
      } else if (parsed.version) {
        versions.push(parsed.version)
      } else {
        skipped++
      }

      for (const version of versions) {
        const where = {
          externalId: cveId,
          packageName: parsed.name,
          packageVersion: version,
          ...(parsed.ecosystem ? { ecosystem: parsed.ecosystem } : {}),
        }

        const alerts = await prisma.alert.findMany({
          where,
          select: { id: true, status: true, vexJustification: true, ignoreReason: true },
        })

        if (alerts.length === 0) { notFound++; continue }

        for (const alert of alerts) {
          if (
            alert.status === newStatus &&
            alert.vexJustification === newVexJustification &&
            alert.ignoreReason === newIgnoreReason
          ) {
            skipped++; continue
          }

          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              status: newStatus,
              vexJustification: newVexJustification,
              ignoreReason: newIgnoreReason,
              ...(newStatus === "resolved" ? { resolvedAt: new Date() } : {}),
              ...(newStatus !== "resolved" && alert.status === "resolved" ? { resolvedAt: null } : {}),
            },
          })

          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              type: "vex_imported",
              data: {
                source,
                state,
                from: alert.status,
                to: newStatus,
                ...(newIgnoreReason ? { ignoreReason: newIgnoreReason } : {}),
                ...(justification ? { justification } : {}),
              },
            },
          })

          applied++
        }
      }
    }
  }

  return NextResponse.json({ applied, skipped, notFound, unsupportedRange })
}
