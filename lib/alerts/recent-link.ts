/**
 * The Alerts list link behind a dashboard card's "24h" row: the open alerts of one asset (or
 * one package version) detected since `since`, the instant the card's 24 hours began. It is the
 * very instant the card counted from, not a calendar day, so the list holds exactly the alerts
 * the row counted. The default statuses (open and in progress) are the ones the card counts.
 */
export function recentAlertsHref(scope: { assetId: string } | { packageName: string; packageVersion: string }, since: Date): string {
  const p = new URLSearchParams()
  if ("assetId" in scope) {
    p.set("assetId", scope.assetId)
  } else {
    p.set("packageName", scope.packageName)
    p.set("packageVersion", scope.packageVersion)
  }
  p.set("detectedFrom", since.toISOString())
  return `/alerts?${p}`
}
