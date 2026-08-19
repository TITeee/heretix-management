import { prisma } from "@/lib/db"
import { getVulnerabilityById } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"
import { logger } from "@/lib/logger"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"
import { diffAlertMetadata } from "@/lib/alert-metadata"

// heretix-api has no lookup-by-id batch endpoint, so each vulnerability costs one
// request. They run a few at a time rather than one after another; the cap keeps the
// refresh from opening a connection per vulnerability against a shared service.
const LOOKUP_CONCURRENCY = 10

export async function refreshMetadata(): Promise<{ updated: number; failed: number }> {
  // Load SLA configuration
  const slaSetting = await prisma.setting.findUnique({
    where: { key: "sla_config" },
  })
  let slaConfig = DEFAULT_SLA_CONFIG
  if (slaSetting) {
    try {
      slaConfig = JSON.parse(slaSetting.value) as SlaConfig
    } catch {
      // Use default if parsing fails
    }
  }

  const alerts = await prisma.alert.findMany({
    where: { status: { notIn: ["resolved", "ignored"] } },
    select: {
      id: true, externalId: true, cvssScore: true, cvssVector: true, severity: true, isKev: true,
      epssScore: true, epssPercentile: true, fixedVersion: true, detectedAt: true,
      assetId: true, packageName: true, packageVersion: true,
    },
  })

  // Grouped up front: scanning the whole alert list once per vulnerability turns the
  // refresh quadratic on installations where one CVE covers many assets.
  const alertsByExternalId = new Map<string, typeof alerts>()
  for (const a of alerts) {
    const group = alertsByExternalId.get(a.externalId)
    if (group) group.push(a)
    else alertsByExternalId.set(a.externalId, [a])
  }
  const uniqueIds = [...alertsByExternalId.keys()]
  const run = await prisma.metadataRefreshRun.create({ data: { updatedCount: 0 } })

  let updated = 0
  let totalEvents = 0
  let failed = 0

  const severityChangedMap = new Map<string, AlertSummary[]>()
  const kevAddedMap = new Map<string, AlertSummary[]>()

  const refreshOne = async (externalId: string) => {
    try {
      const vuln = await getVulnerabilityById(externalId)
      if (!vuln) return

      const targets = alertsByExternalId.get(externalId) ?? []

      for (const alert of targets) {
        // getVulnerabilityById looks up by vulnerability alone, not a specific
        // package/version match, so it has no per-match fixedVersion to offer —
        // fixedVersion is left undefined, meaning "don't touch it" (see
        // diffAlertMetadata's AlertMetadataUpdate.fixedVersion).
        const diff = diffAlertMetadata(
          alert,
          {
            cvssScore: vuln.cvssScore ?? null,
            cvssVector: vuln.cvssVector ?? null,
            severity: vuln.severity ?? null,
            summary: vuln.summary ?? null,
            isKev: vuln.isKev ?? false,
            epssScore: vuln.epssScore ?? null,
            epssPercentile: vuln.epssPercentile ?? null,
          },
          slaConfig
        )

        if (diff.changed) {
          await prisma.alert.update({ where: { id: alert.id }, data: diff.data })
          updated++
        }

        if (diff.events.length > 0) {
          await prisma.alertEvent.createMany({
            data: diff.events.map((e) => ({ alertId: alert.id, type: e.type, data: e.data, metadataRefreshRunId: run.id })),
          })
          totalEvents += diff.events.length
        }

        if (diff.slack.severityChanged) {
          if (!severityChangedMap.has(alert.assetId)) severityChangedMap.set(alert.assetId, [])
          severityChangedMap.get(alert.assetId)!.push(diff.slack.severityChanged)
        }
        if (diff.slack.kevAdded) {
          if (!kevAddedMap.has(alert.assetId)) kevAddedMap.set(alert.assetId, [])
          kevAddedMap.get(alert.assetId)!.push(diff.slack.kevAdded)
        }
      }
    } catch (err) {
      // One vulnerability failing must not abandon the rest, but it is not nothing
      // either: a refresh that reaches nothing would otherwise report a clean run.
      failed++
      logger.warn("metadata refresh failed for vulnerability", {
        externalId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  for (let i = 0; i < uniqueIds.length; i += LOOKUP_CONCURRENCY) {
    await Promise.all(uniqueIds.slice(i, i + LOOKUP_CONCURRENCY).map(refreshOne))
  }

  logger.info("metadata refresh completed", {
    vulnerabilities: uniqueIds.length,
    alerts: alerts.length,
    updated,
    events: totalEvents,
    failed,
  })
  if (failed > 0) {
    logger.warn("metadata refresh could not reach some vulnerabilities", {
      failed,
      total: uniqueIds.length,
    })
  }

  if (totalEvents === 0) {
    await prisma.metadataRefreshRun.delete({ where: { id: run.id } })
  } else {
    await prisma.metadataRefreshRun.update({ where: { id: run.id }, data: { updatedCount: updated } })
  }

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

  return { updated, failed }
}
