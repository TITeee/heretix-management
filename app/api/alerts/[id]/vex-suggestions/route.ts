import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

/**
 * Prior ignore judgments recorded for the *same finding* (same vulnerability,
 * package, version and ecosystem) on other assets.
 *
 * These are surfaced for a human to consider, never applied automatically. Of the
 * nine CycloneDX justifications only `code_not_present` and
 * `protected_by_compiler` are properties of the build itself; the other seven
 * describe the deployment (network placement, runtime protections, configuration,
 * reachability from the calling application), so a judgment made on one asset can
 * be plainly wrong on another. `environmentDiffers` flags assets carrying
 * different tags, the signal most likely to invalidate a reused judgment.
 */

const BUILD_LEVEL_JUSTIFICATIONS = new Set(["code_not_present", "protected_by_compiler"])

const MAX_SUGGESTIONS = 5

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const alert = await prisma.alert.findUnique({
    where: { id },
    select: {
      externalId: true,
      packageName: true,
      packageVersion: true,
      ecosystem: true,
      ignoreReason: true,
      vexJustification: true,
      asset: { select: { assetTags: { select: { tag: { select: { name: true } } } } } },
    },
  })
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 })

  const ownTags = alert.asset.assetTags.map((t) => t.tag.name).sort()

  const others = await prisma.alert.findMany({
    where: {
      id: { not: id },
      externalId: alert.externalId,
      packageName: alert.packageName,
      packageVersion: alert.packageVersion,
      ecosystem: alert.ecosystem,
      status: "ignored",
      // A reason, or a justification from before the reason column existed.
      OR: [{ ignoreReason: { not: null } }, { vexJustification: { not: null } }],
    },
    select: {
      id: true,
      ignoreReason: true,
      vexJustification: true,
      updatedAt: true,
      asset: {
        select: {
          name: true,
          hostname: true,
          assetTags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_SUGGESTIONS,
  })

  // Nothing to suggest if this alert already carries that same judgment.
  const candidates = others.filter(
    (o) =>
      o.ignoreReason !== alert.ignoreReason ||
      o.vexJustification !== alert.vexJustification
  )
  if (candidates.length === 0) return NextResponse.json([])

  // Attribution comes from the event log, which records who set the justification
  // (vex_justification_set) or which document it arrived in (vex_imported).
  const events = await prisma.alertEvent.findMany({
    where: {
      alertId: { in: candidates.map((c) => c.id) },
      type: { in: ["vex_justification_set", "vex_imported"] },
    },
    orderBy: { createdAt: "desc" },
    select: { alertId: true, type: true, data: true, createdAt: true },
  })
  const latestEvent = new Map<string, (typeof events)[number]>()
  for (const e of events) {
    if (!latestEvent.has(e.alertId)) latestEvent.set(e.alertId, e)
  }

  const suggestions = candidates.map((c) => {
    const tags = c.asset.assetTags.map((t) => t.tag.name).sort()
    const event = latestEvent.get(c.id)
    const data = (event?.data ?? {}) as Record<string, unknown>
    // Pre-column rows carry a justification and no reason, which meant not_affected.
    const reason = c.ignoreReason ?? "not_affected"
    return {
      reason,
      justification: c.vexJustification,
      assetName: c.asset.name || c.asset.hostname,
      assetTags: tags,
      environmentDiffers: tags.join(",") !== ownTags.join(","),
      // A false positive is a property of the scan, not of where the package runs,
      // so it carries across assets the same way a build-level justification does.
      requiresReverification:
        reason === "not_affected" && !BUILD_LEVEL_JUSTIFICATIONS.has(c.vexJustification ?? ""),
      decidedBy:
        event?.type === "vex_imported"
          ? "VEX import"
          : typeof data.userName === "string"
            ? data.userName
            : null,
      decidedAt: (event?.createdAt ?? c.updatedAt).toISOString(),
    }
  })

  return NextResponse.json(suggestions)
}
