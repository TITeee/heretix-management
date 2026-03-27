import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { getVulnerabilityById } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch all alerts except those with resolved / ignored status
  const alerts = await prisma.alert.findMany({
    where: { status: { notIn: ["resolved", "ignored"] } },
    select: {
      id: true, externalId: true, cvssScore: true, cvssVector: true, severity: true, isKev: true,
      epssScore: true, epssPercentile: true,
      assetId: true, packageName: true, packageVersion: true,
    },
  })

  // Deduplicate by externalId
  const uniqueIds = [...new Set(alerts.map(a => a.externalId))]

  // Create a run record upfront to get its id
  const run = await prisma.metadataRefreshRun.create({ data: { updatedCount: 0 } })

  let updated = 0
  let totalEvents = 0

  // Collect per-asset alerts for Slack notification
  const severityChangedMap = new Map<string, AlertSummary[]>()
  const kevAddedMap = new Map<string, AlertSummary[]>()

  for (const externalId of uniqueIds) {
    try {
      const vuln = await getVulnerabilityById(externalId)
      if (!vuln) continue

      const targets = alerts.filter(a => a.externalId === externalId)

      for (const alert of targets) {
        // Detect changes and record events
        const events: { type: string; data: object }[] = []

        if (alert.cvssScore != null && vuln.cvssScore != null && vuln.cvssScore !== alert.cvssScore) {
          events.push({ type: "cvss_changed", data: { from: alert.cvssScore, to: vuln.cvssScore } })
        }
        if ((vuln.severity ?? null) !== (alert.severity ?? null)) {
          events.push({ type: "severity_changed", data: { from: alert.severity, to: vuln.severity ?? null } })
          const entry: AlertSummary = {
            packageName: alert.packageName,
            packageVersion: alert.packageVersion,
            externalId: alert.externalId,
            severity: vuln.severity ?? null,
            cvssScore: vuln.cvssScore ?? null,
          }
          if (!severityChangedMap.has(alert.assetId)) severityChangedMap.set(alert.assetId, [])
          severityChangedMap.get(alert.assetId)!.push(entry)
        }
        if (!alert.isKev && (vuln.isKev ?? false)) {
          events.push({ type: "kev_added", data: {} })
          const entry: AlertSummary = {
            packageName: alert.packageName,
            packageVersion: alert.packageVersion,
            externalId: alert.externalId,
            severity: vuln.severity ?? null,
            cvssScore: vuln.cvssScore ?? null,
          }
          if (!kevAddedMap.has(alert.assetId)) kevAddedMap.set(alert.assetId, [])
          kevAddedMap.get(alert.assetId)!.push(entry)
        }
        if (alert.epssScore != null && vuln.epssScore != null && vuln.epssScore !== alert.epssScore) {
          events.push({ type: "epss_changed", data: { from: alert.epssScore, to: vuln.epssScore, percentileFrom: alert.epssPercentile, percentileTo: vuln.epssPercentile } })
        }

        // Only update when there is an actual change (so that updatedAt is meaningful)
        const hasChange =
          (vuln.cvssScore ?? null) !== alert.cvssScore ||
          (vuln.cvssVector ?? null) !== (alert.cvssVector ?? null) ||
          (vuln.severity ?? null) !== alert.severity ||
          (vuln.isKev ?? false) !== alert.isKev ||
          (vuln.epssScore ?? null) !== alert.epssScore

        if (hasChange) {
          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              cvssScore: vuln.cvssScore ?? null,
              cvssVector: vuln.cvssVector ?? null,
              severity: vuln.severity ?? null,
              summary: vuln.summary ?? null,
              isKev: vuln.isKev ?? false,
              epssScore: vuln.epssScore ?? null,
              epssPercentile: vuln.epssPercentile ?? null,
            },
          })
          updated++
        }

        if (events.length > 0) {
          await prisma.alertEvent.createMany({
            data: events.map(e => ({ alertId: alert.id, type: e.type, data: e.data, metadataRefreshRunId: run.id })),
          })
          totalEvents += events.length
        }
      }
    } catch {
      // Skip heretix-api errors
    }
  }

  // Update run with final count, or delete if nothing changed
  if (totalEvents === 0) {
    await prisma.metadataRefreshRun.delete({ where: { id: run.id } })
  } else {
    await prisma.metadataRefreshRun.update({ where: { id: run.id }, data: { updatedCount: updated } })
  }

  // Slack notifications per asset
  for (const [assetId, slackAlerts] of severityChangedMap) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true, assetTags: { select: { tagId: true } } } })
    if (!asset) continue
    await notifySlackIfNeeded({
      assetName: asset.name || asset.hostname,
      assetTagIds: asset.assetTags.map((at) => at.tagId),
      triggerType: "severity_changed",
      alerts: slackAlerts,
    }).catch(() => {})
  }

  for (const [assetId, slackAlerts] of kevAddedMap) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { name: true, hostname: true, assetTags: { select: { tagId: true } } } })
    if (!asset) continue
    await notifySlackIfNeeded({
      assetName: asset.name || asset.hostname,
      assetTagIds: asset.assetTags.map((at) => at.tagId),
      triggerType: "kev_added",
      alerts: slackAlerts,
    }).catch(() => {})
  }

  return NextResponse.json({ updated })
}
