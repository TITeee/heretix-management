import type { AlertSummary } from "@/lib/slack"
import { calculateDueDate, type SlaConfig } from "@/lib/sla"

export type AlertMetadataSnapshot = {
  cvssScore: number | null
  cvssVector: string | null
  severity: string | null
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
  fixedVersion: string | null
}

export type AlertMetadataUpdate = Omit<AlertMetadataSnapshot, "fixedVersion"> & {
  summary: string | null
  /**
   * Omit (undefined) when the source has no notion of a per-match fixed version —
   * refreshMetadata's lookup is keyed on the vulnerability alone, not a specific
   * package/version match, so it has nothing meaningful to offer here. A scan
   * result always has one (even if null), so it is diffed and applied.
   */
  fixedVersion?: string | null
}

export type AlertMetadataDiff = {
  changed: boolean
  data: {
    cvssScore: number | null
    cvssVector: string | null
    severity: string | null
    summary: string | null
    isKev: boolean
    epssScore: number | null
    epssPercentile: number | null
    fixedVersion?: string | null
    dueDate?: Date | null
  }
  events: { type: string; data: object }[]
  slack: { severityChanged?: AlertSummary; kevAdded?: AlertSummary }
}

/**
 * Compares an alert's stored metadata against a fresh result for the same
 * finding and produces the update, timeline events, and Slack summaries a
 * caller should apply — without touching the database itself, so refreshMetadata
 * (which batches these across many alerts into one MetadataRefreshRun) and
 * scanAsset (which applies one immediately per match) can each drive it their
 * own way.
 *
 * cvss_changed and epss_changed intentionally only fire when both the stored and
 * incoming value are non-null — a value first appearing, or disappearing, is not
 * treated as a "change" worth a timeline entry, matching the pre-existing
 * refreshMetadata behavior this was extracted from. summary is applied whenever
 * anything else changes but does not by itself count as a change (also
 * pre-existing), so a summary-only edit upstream does not get picked up here.
 */
export function diffAlertMetadata(
  alert: AlertMetadataSnapshot & {
    packageName: string
    packageVersion: string
    externalId: string
    detectedAt: Date
  },
  incoming: AlertMetadataUpdate,
  slaConfig: SlaConfig
): AlertMetadataDiff {
  const events: { type: string; data: object }[] = []
  const slack: AlertMetadataDiff["slack"] = {}

  if (alert.cvssScore != null && incoming.cvssScore != null && incoming.cvssScore !== alert.cvssScore) {
    events.push({ type: "cvss_changed", data: { from: alert.cvssScore, to: incoming.cvssScore } })
  }
  if ((incoming.severity ?? null) !== (alert.severity ?? null)) {
    events.push({ type: "severity_changed", data: { from: alert.severity, to: incoming.severity ?? null } })
    slack.severityChanged = {
      packageName: alert.packageName,
      packageVersion: alert.packageVersion,
      externalId: alert.externalId,
      severity: incoming.severity ?? null,
      cvssScore: incoming.cvssScore ?? null,
    }
  }
  if (!alert.isKev && (incoming.isKev ?? false)) {
    events.push({ type: "kev_added", data: {} })
    slack.kevAdded = {
      packageName: alert.packageName,
      packageVersion: alert.packageVersion,
      externalId: alert.externalId,
      severity: incoming.severity ?? null,
      cvssScore: incoming.cvssScore ?? null,
    }
  }
  if (alert.epssScore != null && incoming.epssScore != null && Math.abs(incoming.epssScore - alert.epssScore) >= 0.001) {
    events.push({
      type: "epss_changed",
      data: { from: alert.epssScore, to: incoming.epssScore, percentileFrom: alert.epssPercentile, percentileTo: incoming.epssPercentile },
    })
  }

  const fixedVersionChanged = incoming.fixedVersion !== undefined && incoming.fixedVersion !== alert.fixedVersion
  const changed =
    (incoming.cvssScore ?? null) !== alert.cvssScore ||
    (incoming.cvssVector ?? null) !== (alert.cvssVector ?? null) ||
    (incoming.severity ?? null) !== alert.severity ||
    (incoming.isKev ?? false) !== alert.isKev ||
    (incoming.epssScore ?? null) !== alert.epssScore ||
    fixedVersionChanged

  if (!changed) {
    return { changed: false, data: { ...incoming }, events: [], slack: {} }
  }

  const cvssOrKevChanged = (incoming.cvssScore ?? null) !== alert.cvssScore || (incoming.isKev ?? false) !== alert.isKev
  const dueDate = cvssOrKevChanged
    ? calculateDueDate(incoming.cvssScore ?? null, incoming.isKev ?? false, alert.detectedAt, slaConfig)
    : undefined

  return {
    changed: true,
    data: {
      cvssScore: incoming.cvssScore ?? null,
      cvssVector: incoming.cvssVector ?? null,
      severity: incoming.severity ?? null,
      summary: incoming.summary ?? null,
      isKev: incoming.isKev ?? false,
      epssScore: incoming.epssScore ?? null,
      epssPercentile: incoming.epssPercentile ?? null,
      ...(incoming.fixedVersion !== undefined && { fixedVersion: incoming.fixedVersion }),
      ...(dueDate !== undefined && { dueDate }),
    },
    events,
    slack,
  }
}
