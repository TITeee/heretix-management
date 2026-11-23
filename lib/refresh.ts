import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getVulnerabilityById } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"
import { logger } from "@/lib/logger"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"
import { diffAlertMetadata } from "@/lib/alert-metadata"
import { recordRefreshStatus } from "@/lib/refresh-status"
import { createPacer } from "@/lib/pacer"

// heretix-api has no lookup-by-id batch endpoint, so each vulnerability costs one
// request. They run a few at a time rather than one after another; the cap keeps the
// refresh from opening a connection per vulnerability against a shared service.
const LOOKUP_CONCURRENCY = 10

// heretix-api limits a client to 1,200 requests a minute by default, and everything
// heretix-management sends shares that budget. A refresh that took all of it left the
// alert detail panel (which does not wait on a 429) failing for as long as it ran, so
// the refresh keeps to three quarters of the default and leaves the rest for people
// using the console. Raise it together with heretix-api's RATE_LIMIT_MAX; 0 turns the
// pacing off.
const DEFAULT_LOOKUPS_PER_MINUTE = 900

const REFRESH_ALERT_SELECT = {
  id: true, externalId: true, cvssScore: true, cvssVector: true, severity: true, isKev: true,
  epssScore: true, epssPercentile: true, fixedVersion: true, detectedAt: true,
  assetId: true, packageName: true, packageVersion: true, status: true,
} satisfies Prisma.AlertSelect
type RefreshAlert = Prisma.AlertGetPayload<{ select: typeof REFRESH_ALERT_SELECT }>

export function refreshLookupsPerMinute(env: string | undefined = process.env.HERETIX_API_REFRESH_PER_MINUTE): number {
  const n = Number(env)
  return env !== undefined && env.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : DEFAULT_LOOKUPS_PER_MINUTE
}

export async function refreshMetadata(): Promise<{ updated: number; failed: number; total: number }> {
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

  // Only the vulnerability ids are read up front; each group of lookups then reads the
  // alerts of its own vulnerabilities. Reading every open alert at once held 1.7 GB for
  // the whole run (it takes minutes, paced) on 1.7 million alerts, next to a 2 GB heap.
  const openAlerts = { status: { notIn: ["resolved", "ignored"] } } satisfies Prisma.AlertWhereInput
  const uniqueIds = (await prisma.alert.groupBy({ by: ["externalId"], where: openAlerts }))
    .map((g) => g.externalId)
  let alertCount = 0
  const run = await prisma.metadataRefreshRun.create({ data: { updatedCount: 0 } })

  let updated = 0
  let totalEvents = 0
  let failed = 0

  const severityChangedMap = new Map<string, AlertSummary[]>()
  const kevAddedMap = new Map<string, AlertSummary[]>()

  const pace = createPacer(refreshLookupsPerMinute())

  const refreshOne = async (externalId: string, targets: RefreshAlert[]) => {
    try {
      await pace()
      const vuln = await getVulnerabilityById(externalId, { waitOnRateLimit: true })
      if (!vuln) return

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
    const ids = uniqueIds.slice(i, i + LOOKUP_CONCURRENCY)
    // Read when its turn comes, so an alert a scan resolved meanwhile is left alone.
    const alerts = await prisma.alert.findMany({
      where: { ...openAlerts, externalId: { in: ids } },
      select: REFRESH_ALERT_SELECT,
    })
    alertCount += alerts.length
    const byId = new Map<string, RefreshAlert[]>()
    for (const a of alerts) {
      const group = byId.get(a.externalId)
      if (group) group.push(a)
      else byId.set(a.externalId, [a])
    }
    await Promise.all(ids.map((id) => refreshOne(id, byId.get(id) ?? [])))
  }

  logger.info("metadata refresh completed", {
    vulnerabilities: uniqueIds.length,
    alerts: alertCount,
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

  await recordRefreshStatus({ total: uniqueIds.length, failed })
  return { updated, failed, total: uniqueIds.length }
}
