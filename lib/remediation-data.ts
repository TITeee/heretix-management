import { prisma } from "@/lib/db"
import {
  buildRemediationPlan,
  compareAlertUrgency,
  type RemediationAlertInput,
  type RemediationPlan,
  type RemediationSection,
} from "@/lib/remediation"

/**
 * What the Remediation view reads from an asset's alerts: only the columns that decide a
 * group and the order inside it. An asset can have tens of thousands of alerts, and the full
 * rows (summary, vector, notes, ...) are what made the view slow; those are read for the
 * page being shown only (see alertsOfGroup).
 */
const PLAN_COLUMNS = {
  id: true,
  externalId: true,
  packageName: true,
  packageVersion: true,
  ecosystem: true,
  sourcePackage: true,
  fixedVersion: true,
  fixStatus: true,
  distroPriority: true,
  severity: true,
  cvssScore: true,
  isKev: true,
} as const

type PlanAlert = RemediationAlertInput & { externalId: string }

const OPEN_WHERE = { status: { in: ["open", "in_progress"] } }
// Ignored as accepted risk, and a fix has appeared since (see the route for why it only points these out).
const ACCEPTED_WITH_FIX_WHERE = { status: "ignored", ignoreReason: "accepted_risk", fixedVersion: { not: null } }

function loadPackages(assetId: string) {
  return prisma.package.findMany({
    where: { assetId },
    select: { name: true, version: true, ecosystem: true, direct: true, deps: true, source: true },
  })
}

function loadAlerts(assetId: string, where: object): Promise<PlanAlert[]> {
  return prisma.alert.findMany({ where: { assetId, ...where }, select: PLAN_COLUMNS })
}

/** The asset's open alerts grouped into changes and no-fix groups, plus the accepted-with-fix changes. */
export async function loadRemediation(assetId: string): Promise<{ plan: RemediationPlan; acceptedWithFix: RemediationPlan["actions"] }> {
  const [alerts, accepted, packages] = await Promise.all([
    loadAlerts(assetId, OPEN_WHERE),
    loadAlerts(assetId, ACCEPTED_WITH_FIX_WHERE),
    loadPackages(assetId),
  ])
  return {
    plan: buildRemediationPlan(alerts, packages),
    acceptedWithFix: buildRemediationPlan(accepted, packages).actions,
  }
}

/**
 * The ids of one group's alerts, most urgent first (KEV, severity, CVSS), recomputed from the
 * asset's current alerts; null when there is no such group (it emptied since the page was
 * loaded). Only the list a section needs is read.
 */
export async function groupAlertIds(assetId: string, section: RemediationSection, key: string): Promise<string[] | null> {
  const [alerts, packages] = await Promise.all([
    loadAlerts(assetId, section === "accepted" ? ACCEPTED_WITH_FIX_WHERE : OPEN_WHERE),
    loadPackages(assetId),
  ])
  const plan = buildRemediationPlan(alerts, packages)
  const groups = section === "noFix" ? plan.noFix : plan.actions
  const group = groups.find((g) => g.key === key)
  if (!group) return null

  const byId = new Map(alerts.map((a) => [a.id, a]))
  return [...group.alertIds].sort((a, b) => compareAlertUrgency(byId.get(a)!, byId.get(b)!))
}

/** The ids of the open no-fix alerts with this distro fix status ("" for none given). */
export function noFixWhere(fixStatusKey: string) {
  return { ...OPEN_WHERE, fixedVersion: null, fixStatus: fixStatusKey === "" ? null : fixStatusKey }
}
