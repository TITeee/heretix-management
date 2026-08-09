import { prisma } from "@/lib/db"

export type PackageIdentity = {
  assetId: string
  name: string
  version: string
  ecosystem: string
}

/**
 * Moves the open alerts of a package onto its new identity.
 *
 * An alert is keyed on the package it was raised against, so changing that package —
 * by editing it or by re-importing an inventory that upgraded it — would otherwise
 * strand its alerts on an identity that is no longer installed. Carrying the rows over
 * keeps one alert per finding: the ones that still apply are recognised by the next
 * scan and keep their status, assignee, comments and SLA due date, and the ones that
 * are genuinely fixed are closed by that scan's reconciliation rather than by the edit.
 *
 * Nothing here decides whether a finding still applies. Comparing version strings to
 * answer that would mean guessing, and a wrong guess silently hides a real finding —
 * only heretix-api can tell whether a version is affected.
 *
 * Returns the number of alerts moved.
 */
export async function carryForwardAlerts(
  from: PackageIdentity,
  to: PackageIdentity
): Promise<number> {
  // Alerts are matched on name + version, the same way the scan matches them;
  // ecosystem is left out because heretix-api may report a different one.
  const carried = await prisma.alert.findMany({
    where: {
      assetId: from.assetId,
      packageName: from.name,
      packageVersion: from.version,
      status: { in: ["open", "in_progress"] },
    },
    select: { id: true, externalId: true },
  })
  if (carried.length === 0) return 0

  // A row already sitting on the new identity describes the same finding at the
  // version the package now has, so it gives way to the row that carries the
  // investigation history. Without this the alert key would collide.
  await prisma.alert.deleteMany({
    where: {
      assetId: to.assetId,
      packageName: to.name,
      packageVersion: to.version,
      externalId: { in: carried.map((a) => a.externalId) },
      id: { notIn: carried.map((a) => a.id) },
    },
  })

  await prisma.alert.updateMany({
    where: { id: { in: carried.map((a) => a.id) } },
    data: { packageName: to.name, packageVersion: to.version, ecosystem: to.ecosystem },
  })
  await prisma.alertEvent.createMany({
    data: carried.map((a) => ({
      alertId: a.id,
      type: "package_changed",
      data: { from: `${from.name}@${from.version}`, to: `${to.name}@${to.version}` },
    })),
  })

  return carried.length
}
