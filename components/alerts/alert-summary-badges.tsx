import type { ReactNode } from "react"
import Link from "next/link"
import { FaTriangleExclamation } from "react-icons/fa6"
import { SEVERITY_COLORS, getAlertSeverityTier } from "@/lib/severity"

export type AlertSummary = Record<string, number>

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]
const KNOWN_SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"])

// Some sources use severity wording this app doesn't otherwise recognize
// (e.g. GHSA's "MODERATE" instead of "MEDIUM"). Folding anything outside the
// four known tiers into UNKNOWN — same as a null severity — keeps this
// summary's total in sync with the real alert count instead of silently
// dropping those alerts under an unread key.
export function buildAlertSummary(rows: { severity: string | null; _count: { id: number } }[]): AlertSummary {
  const summary: AlertSummary = {}
  for (const r of rows) {
    const key = r.severity && KNOWN_SEVERITIES.has(r.severity) ? r.severity : "UNKNOWN"
    summary[key] = (summary[key] ?? 0) + r._count.id
  }
  return summary
}

function severityColor(s: string): string {
  return SEVERITY_COLORS[getAlertSeverityTier(s, null)]
}

// Only linked when scoped to a single asset — a tag's summary spans many
// assets (or many packages), and /alerts has no filter that means "any of
// these," so linking there would either be wrong or need a filter that
// doesn't exist yet.
export function AlertSummaryBadges({ summary, kevCount, assetId }: { summary: AlertSummary; kevCount?: number; assetId?: string }) {
  function wrap(key: string, href: string, badge: ReactNode) {
    if (!assetId) return <span key={key}>{badge}</span>
    return (
      <Link key={key} href={href} className="hover:opacity-80">
        {badge}
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {SEVERITY_ORDER.map(s => wrap(
        s,
        `/alerts?assetId=${assetId}&severity=${s}`,
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
          style={{ backgroundColor: severityColor(s), color: s === "UNKNOWN" ? "#374151" : "#fff" }}
        >
          {s}: {summary[s] ?? 0}
        </span>
      ))}
      {kevCount !== undefined && wrap(
        "KEV",
        `/alerts?assetId=${assetId}&kev=1`,
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-white"
          style={{ backgroundColor: SEVERITY_COLORS.critical }}
        >
          <FaTriangleExclamation className="h-3 w-3" />
          KEV: {kevCount}
        </span>
      )}
    </div>
  )
}
