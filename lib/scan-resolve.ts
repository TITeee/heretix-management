/**
 * How a scan treats an open alert that heretix-api no longer reports for a
 * package whose answer was complete.
 *
 * Why it vanished decides what the scan may conclude:
 *  - package_updated: the package moved to another version since the last
 *    scan, so the finding plausibly doesn't apply to the new one. The update
 *    is the evidence; resolve at once.
 *  - package_excluded: the package was reclassified as never scanned (dev-only,
 *    kernel/build, OS-managed). Our own inventory decision; resolve at once.
 *  - not_reported: nothing about the package changed, only heretix-api stopped
 *    returning the finding. That is a rejected CVE or a corrected range, but
 *    equally a broken data load that returns empty answers, which would
 *    otherwise close every real finding silently. So it waits out a grace
 *    period, and a scan that would close a large share of an asset's alerts
 *    this way closes none of them (the circuit breaker) and says so.
 */

export type AbsenceCause = "package_updated" | "package_excluded" | "not_reported"

/**
 * How long an alert must stay unreported before it is resolved: three days,
 * like heretix-api's own three-run grace before it drops data, which also
 * outlasts a weekend-long data problem. A few hours short of it, so a daily
 * scan that runs a little early on the last day still counts.
 */
export const MISSING_GRACE_MS = (3 * 24 - 4) * 60 * 60 * 1000

/** The circuit breaker trips when at least this many alerts, and at least this share of the asset's open alerts, are ripe at once. */
export const HOLD_MIN_ALERTS = 10
export const HOLD_MIN_SHARE = 0.3

export type AbsentAlert = {
  id: string
  cause: AbsenceCause
  /** When the alert was first not reported; null the first time it is missed. */
  missingSince: Date | null
}

export type AbsenceDecision = {
  /** Resolve now, with the cause that justifies it. */
  resolve: { id: string; cause: AbsenceCause }[]
  /** First miss of a not_reported alert: start its grace period. */
  startMissing: string[]
  /** Ripe, but the circuit breaker kept them open. */
  held: string[]
}

export function decideAbsentAlerts(absent: AbsentAlert[], openCount: number, now: Date): AbsenceDecision {
  const resolve: AbsenceDecision["resolve"] = []
  const startMissing: string[] = []
  const ripe: string[] = []

  for (const a of absent) {
    if (a.cause !== "not_reported") {
      resolve.push({ id: a.id, cause: a.cause })
    } else if (a.missingSince === null) {
      startMissing.push(a.id)
    } else if (now.getTime() - a.missingSince.getTime() >= MISSING_GRACE_MS) {
      ripe.push(a.id)
    }
  }

  const tripped = ripe.length >= HOLD_MIN_ALERTS && ripe.length >= openCount * HOLD_MIN_SHARE
  if (tripped) return { resolve, startMissing, held: ripe }
  return { resolve: [...resolve, ...ripe.map((id) => ({ id, cause: "not_reported" as const }))], startMissing, held: [] }
}

/** When a not_reported alert becomes eligible for automatic resolution. */
export function graceEndsAt(missingSince: Date): Date {
  return new Date(missingSince.getTime() + MISSING_GRACE_MS)
}
