import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { parsePURL } from "@/lib/purl"

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

export const POST = withApiErrorHandling("vex.import", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Required: a VEX statement is a judgment about a product's deployment, not a
  // fact about a package+version in the abstract — of the nine CycloneDX
  // justifications, only code_not_present and protected_by_compiler describe the
  // build itself, and even those aren't applied without a human clicking "Apply"
  // when reused from the alert detail panel's own suggestion feature. Importing
  // without an asset previously applied every matching statement to every asset
  // sharing that package+version+CVE, silently overriding judgments elsewhere.
  const assetId = req.nextUrl.searchParams.get("assetId")
  if (!assetId) {
    return NextResponse.json({ error: "assetId is required — import VEX from an asset's page" }, { status: 400 })
  }

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
          assetId,
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
})
