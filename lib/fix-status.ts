/**
 * heretix-api's normalized fixStatus values, ordered from "a fix may still
 * come" to "no fix will come". The set may grow; heretix-api's contract is
 * that a consumer treats a value it doesn't know like "affected", so an
 * unknown one sorts there and is shown verbatim rather than hidden.
 */
const FIX_STATUS_ORDER = ["under_investigation", "affected", "deferred", "will_not_fix", "out_of_support"]

const FIX_STATUS_LABELS: Record<string, string> = {
  under_investigation: "Under investigation",
  affected: "Affected",
  deferred: "Fix deferred",
  will_not_fix: "Will not fix",
  out_of_support: "Out of support",
}

/** Display label; an unknown value is returned as-is. null when there is none. */
export function fixStatusLabel(fixStatus: string | null | undefined): string | null {
  if (!fixStatus) return null
  return FIX_STATUS_LABELS[fixStatus] ?? fixStatus
}

/** Sort key along FIX_STATUS_ORDER; undefined (kept last by a table) when there is none. */
export function fixStatusSortKey(fixStatus: string | null | undefined): number | undefined {
  if (!fixStatus) return undefined
  const rank = FIX_STATUS_ORDER.indexOf(fixStatus)
  return rank >= 0 ? rank : FIX_STATUS_ORDER.indexOf("affected")
}
