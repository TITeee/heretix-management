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

/**
 * AlmaLinux and Rocky Linux publish no fix status of their own (confirmed
 * 2026-11-26: neither errata.almalinux.org nor errata.rockylinux.org carries
 * one). heretix-api borrows Red Hat's own OVAL/VEX rows for them instead, as
 * a best-effort proxy (rpmAdvisoryVendor() in heretix-api's
 * search-helpers.ts) — a judgement Red Hat made, not one the installed
 * distro published itself, so the UI must say so wherever a fixStatus came
 * from that borrowed data rather than let it read as the distro's own.
 *
 * Detected from `sources`, not from ecosystem alone: an AlmaLinux/Rocky
 * alert can also carry its own OSV-sourced fixStatus-less rows, and only the
 * borrowed red-hat/red-hat-vex source needs the disclosure.
 */
export function borrowedFixStatusNote(ecosystem: string, sources: string[]): string | null {
  const distro = ecosystem.startsWith("AlmaLinux:") ? "AlmaLinux"
    : ecosystem.startsWith("Rocky Linux:") ? "Rocky Linux"
    : null
  if (!distro) return null
  if (!sources.some(s => s === "red-hat" || s === "advisory-redhat-vex" || s.startsWith("red-hat-"))) return null
  return `from Red Hat's own data; ${distro} does not publish fix status itself`
}
