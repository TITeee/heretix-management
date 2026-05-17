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

function parsePURLWithVersion(purl: string): { ecosystem: string; name: string; version: string } | null {
  // Capture TYPE, PATH, VERSION, and optional qualifiers
  const match = purl.match(/^pkg:(\w+)\/([^@?#]+)@([^?#]*)(?:\?([^#]*))?/)
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
    return { ecosystem, name, version }
  }

  const lastSlash = fullPath.lastIndexOf("/")
  const ecosystem = PURL_TYPE_MAP[type] ?? type
  if (lastSlash === -1) {
    return { ecosystem, name: decodeURIComponent(fullPath), version }
  }
  const name = decodeURIComponent(fullPath.slice(0, lastSlash)) + "/" + decodeURIComponent(fullPath.slice(lastSlash + 1))
  return { ecosystem, name, version }
}

type VexEntry = {
  id?: string
  affects?: { ref?: string }[]
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

  let applied = 0, skipped = 0, notFound = 0

  for (const vuln of vulnerabilities) {
    const cveId = vuln.id
    const state = vuln.analysis?.state
    const justification = vuln.analysis?.justification ?? null

    // Skip: no ID, no state, or "affected" (default assumption, not actionable)
    if (!cveId || !state || state === "affected") { skipped++; continue }

    // Map VEX state → heretix status
    let newStatus: string
    switch (state) {
      case "not_affected":       newStatus = "ignored"; break
      case "fixed":              newStatus = "resolved"; break
      case "under_investigation": newStatus = "in_progress"; break
      default:                   skipped++; continue
    }

    const newVexJustification = state === "not_affected" ? justification : null

    for (const affect of vuln.affects ?? []) {
      if (!affect.ref) { skipped++; continue }

      const parsed = parsePURLWithVersion(affect.ref)
      if (!parsed) { skipped++; continue }

      const where = {
        externalId: cveId,
        packageName: parsed.name,
        packageVersion: parsed.version,
        ...(parsed.ecosystem ? { ecosystem: parsed.ecosystem } : {}),
      }

      const alerts = await prisma.alert.findMany({
        where,
        select: { id: true, status: true, vexJustification: true },
      })

      if (alerts.length === 0) { notFound++; continue }

      for (const alert of alerts) {
        if (alert.status === newStatus && alert.vexJustification === newVexJustification) {
          skipped++; continue
        }

        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            status: newStatus,
            vexJustification: newVexJustification,
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
              ...(justification ? { justification } : {}),
            },
          },
        })

        applied++
      }
    }
  }

  return NextResponse.json({ applied, skipped, notFound })
}
