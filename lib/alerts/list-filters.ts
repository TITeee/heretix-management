/**
 * How the Alerts list narrows and groups alerts in the browser. Moved out of
 * app/(console)/alerts/alerts-table.tsx unchanged, so the server-side list
 * (lib/alerts/query.ts) can be checked against the very code the page runs
 * (lib/alerts/query.integration.test.ts). Client-safe: no database access.
 */
import { getAlertSeverityTier } from "@/lib/severity"
import { getSlaStatus } from "@/lib/sla"
import { distroPriorityLabel } from "@/lib/distro-priority"

export type Alert = {
  id: string
  assetId: string
  packageName: string
  packageVersion: string
  ecosystem: string
  externalId: string
  sources: string[]
  cvssScore: number | null
  cvssVector: string | null
  severity: string | null
  summary: string | null
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
  approximateMatch: boolean
  status: string
  notes: string | null
  resolveReason: string | null
  vexJustification?: string | null
  ignoreReason?: string | null
  fixedVersion?: string | null
  packageDirect?: boolean | null
  packageExists?: boolean
  sourcePackage?: string | null
  distroPriority?: string | null
  fixStatus?: string | null
  fixStatusDetail?: string | null
  detectedAt: Date
  dueDate: Date | null
  updatedAt: Date
  resolvedAt: Date | null
  asset: { id: string; name: string; hostname: string }
  tags: { id: string; name: string; color: string | null; isDefault?: boolean }[]
  // Display-only: set on the representative row of a source-package group
  // (e.g. binutils's eight binary packages sharing one CVE) so the table can
  // show one row instead of one per sibling. Never persisted — computed in
  // the browser from sourcePackage, and every member stays a real, separately
  // addressable Alert underneath (selection, export, and the detail sheet all
  // still operate on the full list).
  _groupMembers?: Alert[]
}

// Filter value for alerts with no distro rating / fix status; not a label
// either can ever have.
export const NONE_OPTION = "\u0000none"

/** The faceted filters of the Alerts list; an empty set does not narrow. */
export type ListFilters = {
  asset: Set<string>
  status: Set<string>
  cvss: Set<string>
  kev: Set<string>
  ecosystem: Set<string>
  sources: Set<string>
  tag: Set<string>
  dependency: Set<string>
  inventory: Set<string>
  due: Set<string>
  distro: Set<string>
  fixStatus: Set<string>
}

export function matchesListFilters(alert: Alert, f: ListFilters, now: Date = new Date()): boolean {
  if (f.asset.size > 0 && !f.asset.has(alert.assetId)) return false
  if (f.status.size > 0 && !f.status.has(alert.status)) return false
  if (f.cvss.size > 0) {
    const tier = getAlertSeverityTier(alert.severity, alert.cvssScore)
    if (!f.cvss.has(tier)) return false
  }
  if (f.kev.size > 0) {
    const matches =
      (f.kev.has("kev") && alert.isKev) ||
      (f.kev.has("malware") && alert.externalId.startsWith("MAL-"))
    if (!matches) return false
  }
  if (f.ecosystem.size > 0 && !f.ecosystem.has(alert.ecosystem)) return false
  if (f.sources.size > 0 && !alert.sources.some(s => f.sources.has(s))) return false
  if (f.tag.size > 0 && !alert.tags.some(t => f.tag.has(t.id))) return false
  if (f.dependency.size > 0) {
    if (f.dependency.has("direct") && alert.packageDirect !== true) return false
    if (f.dependency.has("indirect") && alert.packageDirect !== false) return false
  }
  if (f.inventory.size > 0 && !f.inventory.has(alert.packageExists === false ? "missing" : "present")) return false
  if (f.due.size > 0) {
    const status = getSlaStatus(alert.dueDate ? new Date(alert.dueDate) : null, now)
    if (!f.due.has(status)) return false
  }
  if (f.distro.size > 0) {
    const label = distroPriorityLabel(alert.ecosystem, alert.distroPriority) ?? NONE_OPTION
    if (!f.distro.has(label)) return false
  }
  if (f.fixStatus.size > 0 && !f.fixStatus.has(alert.fixStatus || NONE_OPTION)) return false
  return true
}

// Collapses sibling findings from the same upstream source package (e.g.
// binutils splits into eight binary packages on Debian, each reporting the
// same CVE) into one row. Nothing is hidden: the representative row lists
// every member, and selection/export/the detail sheet all still act on the
// real underlying alerts, never the group itself.
export function groupBySourcePackage(alerts: Alert[]): Alert[] {
  const groups = new Map<string, Alert[]>()
  for (const alert of alerts) {
    const key = `${alert.assetId}::${alert.sourcePackage ?? alert.packageName}::${alert.packageVersion}::${alert.externalId}`
    const group = groups.get(key)
    if (group) group.push(alert)
    else groups.set(key, [alert])
  }
  return [...groups.values()].map(members => {
    if (members.length === 1) return members[0]
    const [first, ...rest] = [...members].sort((a, b) => a.packageName.localeCompare(b.packageName))
    return { ...first, _groupMembers: [first, ...rest] }
  })
}
