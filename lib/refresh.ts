import { prisma } from "@/lib/db"
import { getVulnerabilityById } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"
import { logger } from "@/lib/logger"
import { calculateDueDate, DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

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
        if (alert.epssScore != null && vuln.epssScore != null && Math.abs(vuln.epssScore - alert.epssScore) >= 0.001) {
          events.push({ type: "epss_changed", data: { from: alert.epssScore, to: vuln.epssScore, percentileFrom: alert.epssPercentile, percentileTo: vuln.epssPercentile } })
        }

        const hasChange =
          (vuln.cvssScore ?? null) !== alert.cvssScore ||
          (vuln.cvssVector ?? null) !== (alert.cvssVector ?? null) ||
          (vuln.severity ?? null) !== alert.severity ||
          (vuln.isKev ?? false) !== alert.isKev ||
          (vuln.epssScore ?? null) !== alert.epssScore

        if (hasChange) {
          // Recalculate dueDate if CVSS or isKev changed
          const cvssOrKevChanged =
            (vuln.cvssScore ?? null) !== alert.cvssScore ||
            (vuln.isKev ?? false) !== alert.isKev
          const newDueDate = cvssOrKevChanged
            ? calculateDueDate(vuln.cvssScore ?? null, vuln.isKev ?? false, alert.detectedAt, slaConfig)
            : undefined

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
              ...(newDueDate !== undefined && { dueDate: newDueDate }),
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
