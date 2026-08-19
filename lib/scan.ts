import { prisma } from "@/lib/db"
import { batchSearch, searchByCPE, type VulnSearchResult } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"
import { logger } from "@/lib/logger"
import { calculateDueDate, DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

const BATCH_SIZE = 1000

// Result caps applied by heretix-api (500 for the batch endpoint, 50 for the CPE
// endpoint, which is its default limit). A package whose result set comes back at
// the cap may have findings missing from the response, so its alerts cannot be
// reconciled: an alert absent from a truncated result is not evidence it is fixed.
const BATCH_RESULT_CAP = 500
const CPE_RESULT_CAP = 50

/**
 * Marks a resolution the scan made on its own. Alerts closed this way are reopened
 * once the scan reports them again; a human decision carries no prefix and stands.
 */
export const AUTO_RESOLVE_PREFIX = "Auto-resolved: "

// Findings are keyed on package name + version + externalId. Ecosystem is left out
// because heretix-api may report a different one for the same finding between scans.
const findingKey = (name: string, version: string, externalId: string) =>
  JSON.stringify([name, version, externalId])
const packageKey = (name: string, version: string) => JSON.stringify([name, version])

/**
 * Closes off the scan jobs a stopped process left behind.
 *
 * A scan only lives for as long as the process running it, so a job still marked
 * running when the server starts was interrupted by a restart, a deploy or a crash
 * and will never complete. Without this it sits in the scan history as "running"
 * for good. Like the cron registration, this assumes one server process: a second
 * instance starting up would write off a scan the first one is still running.
 */
export async function failInterruptedScanJobs(): Promise<number> {
  const { count } = await prisma.scanJob.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorMsg: "Interrupted: the server stopped while the scan was running",
    },
  })
  if (count > 0) logger.warn("marked interrupted scan jobs as failed", { count })
  return count
}

export async function scanAsset(
  assetId: string
): Promise<{ newAlerts: number; resolvedAlerts: number }> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { packages: true, assetTags: true },
  })
  if (!asset) throw new Error(`Asset not found: ${assetId}`)

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

  const job = await prisma.scanJob.create({
    data: { assetId, status: "running", startedAt: new Date() },
  })

  const startedAt = Date.now()

  const pkgs = asset.packages.filter(
    (p) => p.name.trim().length > 0 && p.version.trim().length > 0
  )
  const cpePkgs = pkgs.filter((p) => p.cpe && p.cpe.trim().length > 0)
  const normalPkgs = pkgs.filter((p) => !p.cpe || p.cpe.trim().length === 0)

  logger.info("scan started", {
    assetId,
    totalPackages: pkgs.length,
    normalPackages: normalPkgs.length,
    cpePackages: cpePkgs.length,
  })

  try {
    // Every alert on the asset, read once. Serves both as the dedup index and as the
    // set reconciliation works from once the scan results are known.
    const existingAlerts = await prisma.alert.findMany({
      where: { assetId },
      select: {
        id: true,
        packageName: true,
        packageVersion: true,
        externalId: true,
        status: true,
        resolveReason: true,
      },
    })
    const alertsByFinding = new Map(
      existingAlerts.map((a) => [findingKey(a.packageName, a.packageVersion, a.externalId), a])
    )

    /** Findings this scan reported. */
    const seen = new Set<string>()
    /** Packages whose result set is known to be complete, so absences are meaningful. */
    const reconcilable = new Set<string>()

    let newAlertCount = 0
    let reopenedCount = 0
    let renamedCount = 0
    const newAlertsList: AlertSummary[] = []

    // A finding that is reported again must not stay closed because an earlier scan
    // stopped seeing it. Only the scan's own resolutions are reverted.
    const reopenIfAutoResolved = async (alert: (typeof existingAlerts)[number]) => {
      if (alert.status !== "resolved") return
      if (!alert.resolveReason?.startsWith(AUTO_RESOLVE_PREFIX)) return
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: "open", resolvedAt: null, resolveReason: null },
      })
      await prisma.alertEvent.create({
        data: {
          alertId: alert.id,
          type: "status_changed",
          data: { from: "resolved", to: "open", reason: "Detected again by scan" },
        },
      })
      alert.status = "open"
      reopenedCount++
    }

    /**
     * Finds an alert raised under an id this finding used to be reported by.
     *
     * heretix-api reports a finding under its *preferred* id, which is the CVE
     * once one exists and the vendor or OSV id until then. A finding first seen
     * before its CVE was assigned therefore comes back under a different id later,
     * which would otherwise read as the old one disappearing (auto-resolved by the
     * reconciliation below) and an unrelated new one appearing. Matching on the
     * ids it is also known by keeps it a single alert.
     */
    const findByAlias = (packageName: string, packageVersion: string, v: VulnSearchResult) => {
      const reported = v.externalId || v.id
      for (const alias of v.aliases ?? []) {
        if (alias === reported) continue
        const prior = alertsByFinding.get(findingKey(packageName, packageVersion, alias))
        if (prior) return { prior, alias }
      }
      return null
    }

    // Records one finding for a package, whether it came from the package search or
    // from the CPE search: both produce the same alert and the same SLA due date.
    const record = async (
      packageName: string,
      packageVersion: string,
      ecosystem: string,
      fallbackSource: string,
      v: VulnSearchResult
    ) => {
      const externalId = v.externalId || v.id
      const key = findingKey(packageName, packageVersion, externalId)
      seen.add(key)

      const existing = alertsByFinding.get(key)
      if (existing) {
        await reopenIfAutoResolved(existing)
        return
      }

      // Not on record under the id just reported, but possibly on record under one
      // this finding was reported by before a CVE was assigned to it.
      const renamed = findByAlias(packageName, packageVersion, v)
      if (renamed) {
        const { prior, alias } = renamed
        await prisma.alert.update({
          where: { id: prior.id },
          data: {
            externalId,
            // The metadata this alert was raised with came from the identity it no
            // longer has — typically a vendor advisory with no CVSS score at all,
            // which is the whole reason its severity read as n/a. The scan result in
            // hand is the authoritative record for the identity it has now.
            severity: v.severity ?? null,
            cvssScore: v.cvssScore ?? null,
            cvssVector: v.cvssVector ?? null,
            summary: v.summary ?? null,
            isKev: v.isKev ?? false,
            epssScore: v.epssScore ?? null,
            epssPercentile: v.epssPercentile ?? null,
            fixedVersion: v.fixedVersion ?? null,
          },
        })
        await prisma.alertEvent.create({
          data: {
            alertId: prior.id,
            type: "identifier_changed",
            data: { from: alias, to: externalId },
          },
        })
        // Move it in both indexes so the reconciliation below sees it under the id
        // the scan reported, rather than closing it as no longer detected.
        alertsByFinding.delete(findingKey(packageName, packageVersion, alias))
        prior.externalId = externalId
        alertsByFinding.set(key, prior)
        await reopenIfAutoResolved(prior)
        renamedCount++
        return
      }

      const detectedAt = new Date()
      const dueDate = calculateDueDate(
        v.cvssScore ?? null,
        v.isKev ?? false,
        detectedAt,
        slaConfig
      )

      const alert = await prisma.alert.create({
        data: {
          assetId,
          packageName,
          packageVersion,
          ecosystem,
          externalId,
          sources: v.sources?.length ? v.sources : [v.source || fallbackSource],
          cvssScore: v.cvssScore ?? null,
          cvssVector: v.cvssVector ?? null,
          severity: v.severity ?? null,
          summary: v.summary ?? null,
          isKev: v.isKev ?? false,
          epssScore: v.epssScore ?? null,
          epssPercentile: v.epssPercentile ?? null,
          fixedVersion: v.fixedVersion ?? null,
          approximateMatch: v.approximateMatch ?? false,
          detectedAt,
          dueDate,
        },
      })
      alertsByFinding.set(key, {
        id: alert.id,
        packageName,
        packageVersion,
        externalId,
        status: alert.status,
        resolveReason: null,
      })
      await prisma.alertEvent.create({
        data: {
          alertId: alert.id,
          type: "detected",
          data: { cvssScore: v.cvssScore ?? null, severity: v.severity ?? null },
        },
      })
      newAlertsList.push({
        packageName,
        packageVersion,
        externalId,
        severity: v.severity ?? null,
        cvssScore: v.cvssScore ?? null,
      })
      newAlertCount++
    }

    const chunks: typeof normalPkgs[] = []
    for (let i = 0; i < normalPkgs.length; i += BATCH_SIZE) {
      chunks.push(normalPkgs.slice(i, i + BATCH_SIZE))
    }

    for (const chunk of chunks) {
      const results = await batchSearch(
        chunk.map((p) => ({
          package: p.name,
          version: p.version,
          ...(p.ecosystem.trim().length > 0 && { ecosystem: p.ecosystem }),
        }))
      )

      for (const r of results) {
        if (r.vulnerabilities.length < BATCH_RESULT_CAP) {
          reconcilable.add(packageKey(r.package, r.version))
        }
        for (const v of r.vulnerabilities) {
          await record(r.package, r.version, r.ecosystem ?? "", "osv", v)
        }
      }
    }

    for (const p of cpePkgs) {
      const result = await searchByCPE(p.cpe!)
      if (result.results.length < CPE_RESULT_CAP) {
        reconcilable.add(packageKey(p.name, p.version))
      }
      for (const v of result.results) {
        await record(p.name, p.version, "", "nvd", v)
      }
    }

    // Close the alerts the scan no longer reports. Only packages that were actually
    // queried and came back with a complete result set take part: a package that left
    // the inventory, was skipped, or hit the result cap says nothing about whether its
    // findings still apply, and a partial answer must never close a real finding.
    const resolveReason = `${AUTO_RESOLVE_PREFIX}no longer detected by scan`
    const resolvedAt = new Date()
    let resolvedCount = 0
    for (const a of existingAlerts) {
      if (a.status !== "open" && a.status !== "in_progress") continue
      if (!reconcilable.has(packageKey(a.packageName, a.packageVersion))) continue
      if (seen.has(findingKey(a.packageName, a.packageVersion, a.externalId))) continue

      await prisma.alert.update({
        where: { id: a.id },
        data: { status: "resolved", resolvedAt, resolveReason },
      })
      await prisma.alertEvent.create({
        data: {
          alertId: a.id,
          type: "status_changed",
          data: { from: a.status, to: "resolved", reason: resolveReason },
        },
      })
      resolvedCount++
    }

    await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), newAlerts: newAlertCount },
    })
    await prisma.asset.update({
      where: { id: assetId },
      data: { scannedAt: new Date() },
    })

    logger.info("scan completed", {
      assetId,
      newAlerts: newAlertCount,
      resolvedAlerts: resolvedCount,
      reopenedAlerts: reopenedCount,
      renamedAlerts: renamedCount,
      reconciledPackages: reconcilable.size,
      scannedPackages: pkgs.length,
      durationMs: Date.now() - startedAt,
    })

    if (newAlertsList.length > 0) {
      const assetTagIds = asset.assetTags.map((at) => at.tagId)
      await notifySlackIfNeeded({
        assetName: asset.name || asset.hostname,
        assetTagIds,
        triggerType: "detected",
        alerts: newAlertsList,
      }).catch(() => {})
    }

    return { newAlerts: newAlertCount, resolvedAlerts: resolvedCount }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "failed", completedAt: new Date(), errorMsg: msg },
    })
    logger.warn("scan failed", { assetId, error: msg })
    throw err
  }
}

export async function scanAllAssets(): Promise<void> {
  const assets = await prisma.asset.findMany({ select: { id: true } })
  const total = assets.length
  const startedAt = Date.now()

  logger.info("scan all assets started", { total })

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]
    try {
      await scanAsset(asset.id)
      logger.info("scan all assets progress", { assetId: asset.id, index: i + 1, total })
    } catch {
      // Continue scanning remaining assets even if one fails
    }
  }

  logger.info("scan all assets completed", { total, durationMs: Date.now() - startedAt })
}
