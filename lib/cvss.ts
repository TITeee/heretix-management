/**
 * CVSS vector parsing with human-readable metric labels.
 *
 * Three vector formats appear in the data and must be told apart before any
 * lookup, because the same abbreviation can mean different things depending
 * on the version:
 *   - `S` is "Scope" in 3.x but "Safety" in 4.0
 *   - 2.0's `Au` (Authentication) and 4.0's `AU` (Automatable) differ only by case
 * Each version therefore gets its own dictionary, and lookups are case-sensitive.
 */

export type CvssVersion = "2.0" | "3.x" | "4.0"

export type MetricGroup = "Base" | "Threat" | "Temporal" | "Environmental" | "Supplemental"

export const GROUP_ORDER: MetricGroup[] = ["Base", "Threat", "Temporal", "Environmental", "Supplemental"]

export type ParsedMetric = {
  key: string
  label: string
  value: string
  valueLabel: string
  group: MetricGroup
}

type MetricDef = {
  label: string
  group: MetricGroup
  values: Record<string, string>
}

const NOT_DEFINED = { X: "Not Defined" } as const

// ─── CVSS 2.0 ────────────────────────────────────────────────────────────────

const CIA_2_0 = { N: "None", P: "Partial", C: "Complete" } as const

const CVSS_2_0: Record<string, MetricDef> = {
  AV: { label: "Access Vector",         group: "Base", values: { L: "Local", A: "Adjacent Network", N: "Network" } },
  AC: { label: "Access Complexity",     group: "Base", values: { H: "High", M: "Medium", L: "Low" } },
  Au: { label: "Authentication",        group: "Base", values: { M: "Multiple", S: "Single", N: "None" } },
  C:  { label: "Confidentiality Impact", group: "Base", values: CIA_2_0 },
  I:  { label: "Integrity Impact",      group: "Base", values: CIA_2_0 },
  A:  { label: "Availability Impact",   group: "Base", values: CIA_2_0 },

  E:  { label: "Exploitability",        group: "Temporal", values: { U: "Unproven", POC: "Proof-of-Concept", F: "Functional", H: "High", ND: "Not Defined" } },
  RL: { label: "Remediation Level",     group: "Temporal", values: { OF: "Official Fix", TF: "Temporary Fix", W: "Workaround", U: "Unavailable", ND: "Not Defined" } },
  RC: { label: "Report Confidence",     group: "Temporal", values: { UC: "Unconfirmed", UR: "Uncorroborated", C: "Confirmed", ND: "Not Defined" } },
}

// ─── CVSS 3.0 / 3.1 ──────────────────────────────────────────────────────────

const CIA_3X = { H: "High", L: "Low", N: "None" } as const
const CIA_3X_MOD = { ...CIA_3X, ...NOT_DEFINED }
const REQUIREMENT = { H: "High", M: "Medium", L: "Low", ...NOT_DEFINED }

const CVSS_3_X: Record<string, MetricDef> = {
  AV: { label: "Attack Vector",       group: "Base", values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" } },
  AC: { label: "Attack Complexity",   group: "Base", values: { L: "Low", H: "High" } },
  PR: { label: "Privileges Required", group: "Base", values: { N: "None", L: "Low", H: "High" } },
  UI: { label: "User Interaction",    group: "Base", values: { N: "None", R: "Required" } },
  S:  { label: "Scope",               group: "Base", values: { U: "Unchanged", C: "Changed" } },
  C:  { label: "Confidentiality",     group: "Base", values: CIA_3X },
  I:  { label: "Integrity",           group: "Base", values: CIA_3X },
  A:  { label: "Availability",        group: "Base", values: CIA_3X },

  E:  { label: "Exploit Code Maturity", group: "Temporal", values: { H: "High", F: "Functional", P: "Proof-of-Concept", U: "Unproven", ...NOT_DEFINED } },
  RL: { label: "Remediation Level",     group: "Temporal", values: { O: "Official Fix", T: "Temporary Fix", W: "Workaround", U: "Unavailable", ...NOT_DEFINED } },
  RC: { label: "Report Confidence",     group: "Temporal", values: { C: "Confirmed", R: "Reasonable", U: "Unknown", ...NOT_DEFINED } },

  CR:  { label: "Confidentiality Requirement", group: "Environmental", values: REQUIREMENT },
  IR:  { label: "Integrity Requirement",       group: "Environmental", values: REQUIREMENT },
  AR:  { label: "Availability Requirement",    group: "Environmental", values: REQUIREMENT },
  MAV: { label: "Modified Attack Vector",       group: "Environmental", values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical", ...NOT_DEFINED } },
  MAC: { label: "Modified Attack Complexity",   group: "Environmental", values: { L: "Low", H: "High", ...NOT_DEFINED } },
  MPR: { label: "Modified Privileges Required", group: "Environmental", values: { N: "None", L: "Low", H: "High", ...NOT_DEFINED } },
  MUI: { label: "Modified User Interaction",    group: "Environmental", values: { N: "None", R: "Required", ...NOT_DEFINED } },
  MS:  { label: "Modified Scope",               group: "Environmental", values: { U: "Unchanged", C: "Changed", ...NOT_DEFINED } },
  MC:  { label: "Modified Confidentiality",     group: "Environmental", values: CIA_3X_MOD },
  MI:  { label: "Modified Integrity",           group: "Environmental", values: CIA_3X_MOD },
  MA:  { label: "Modified Availability",        group: "Environmental", values: CIA_3X_MOD },
}

// ─── CVSS 4.0 ────────────────────────────────────────────────────────────────

const CIA_4_0 = { H: "High", L: "Low", N: "None" } as const
const CIA_4_0_MOD = { ...CIA_4_0, ...NOT_DEFINED }

const CVSS_4_0: Record<string, MetricDef> = {
  AV: { label: "Attack Vector",        group: "Base", values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" } },
  AC: { label: "Attack Complexity",    group: "Base", values: { L: "Low", H: "High" } },
  AT: { label: "Attack Requirements",  group: "Base", values: { N: "None", P: "Present" } },
  PR: { label: "Privileges Required",  group: "Base", values: { N: "None", L: "Low", H: "High" } },
  UI: { label: "User Interaction",     group: "Base", values: { N: "None", P: "Passive", A: "Active" } },
  VC: { label: "Confidentiality (Vulnerable System)", group: "Base", values: CIA_4_0 },
  VI: { label: "Integrity (Vulnerable System)",       group: "Base", values: CIA_4_0 },
  VA: { label: "Availability (Vulnerable System)",    group: "Base", values: CIA_4_0 },
  SC: { label: "Confidentiality (Subsequent System)", group: "Base", values: CIA_4_0 },
  SI: { label: "Integrity (Subsequent System)",       group: "Base", values: CIA_4_0 },
  SA: { label: "Availability (Subsequent System)",    group: "Base", values: CIA_4_0 },

  E: { label: "Exploit Maturity", group: "Threat", values: { A: "Attacked", P: "Proof-of-Concept", U: "Unreported", ...NOT_DEFINED } },

  CR:  { label: "Confidentiality Requirement", group: "Environmental", values: REQUIREMENT },
  IR:  { label: "Integrity Requirement",       group: "Environmental", values: REQUIREMENT },
  AR:  { label: "Availability Requirement",    group: "Environmental", values: REQUIREMENT },
  MAV: { label: "Modified Attack Vector",       group: "Environmental", values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical", ...NOT_DEFINED } },
  MAC: { label: "Modified Attack Complexity",   group: "Environmental", values: { L: "Low", H: "High", ...NOT_DEFINED } },
  MAT: { label: "Modified Attack Requirements", group: "Environmental", values: { N: "None", P: "Present", ...NOT_DEFINED } },
  MPR: { label: "Modified Privileges Required", group: "Environmental", values: { N: "None", L: "Low", H: "High", ...NOT_DEFINED } },
  MUI: { label: "Modified User Interaction",    group: "Environmental", values: { N: "None", P: "Passive", A: "Active", ...NOT_DEFINED } },
  MVC: { label: "Modified Confidentiality (Vulnerable System)", group: "Environmental", values: CIA_4_0_MOD },
  MVI: { label: "Modified Integrity (Vulnerable System)",       group: "Environmental", values: CIA_4_0_MOD },
  MVA: { label: "Modified Availability (Vulnerable System)",    group: "Environmental", values: CIA_4_0_MOD },
  MSC: { label: "Modified Confidentiality (Subsequent System)", group: "Environmental", values: CIA_4_0_MOD },
  MSI: { label: "Modified Integrity (Subsequent System)",       group: "Environmental", values: { S: "Safety", ...CIA_4_0_MOD } },
  MSA: { label: "Modified Availability (Subsequent System)",    group: "Environmental", values: { S: "Safety", ...CIA_4_0_MOD } },

  S:  { label: "Safety",                        group: "Supplemental", values: { N: "Negligible", P: "Present", ...NOT_DEFINED } },
  AU: { label: "Automatable",                   group: "Supplemental", values: { N: "No", Y: "Yes", ...NOT_DEFINED } },
  R:  { label: "Recovery",                      group: "Supplemental", values: { A: "Automatic", U: "User", I: "Irrecoverable", ...NOT_DEFINED } },
  V:  { label: "Value Density",                 group: "Supplemental", values: { D: "Diffuse", C: "Concentrated", ...NOT_DEFINED } },
  RE: { label: "Vulnerability Response Effort", group: "Supplemental", values: { L: "Low", M: "Moderate", H: "High", ...NOT_DEFINED } },
  U:  { label: "Provider Urgency",              group: "Supplemental", values: { Clear: "Clear", Green: "Green", Amber: "Amber", Red: "Red", ...NOT_DEFINED } },
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * CVSS 2.0 vectors carry no version prefix — they start straight at the first
 * metric (e.g. "AV:N/AC:L/Au:N/..."), so anything without a "CVSS:" prefix is
 * treated as 2.0.
 */
export function detectCvssVersion(vector: string): CvssVersion {
  if (vector.startsWith("CVSS:4.0")) return "4.0"
  if (vector.startsWith("CVSS:3.")) return "3.x"
  return "2.0"
}

/** Version as shown to the user, e.g. "3.1" — taken verbatim from the prefix when present. */
export function cvssVersionLabel(vector: string): string {
  const prefix = vector.split("/")[0]
  return prefix.startsWith("CVSS:") ? prefix.slice("CVSS:".length) : "2.0"
}

function dictFor(version: CvssVersion): Record<string, MetricDef> {
  if (version === "4.0") return CVSS_4_0
  if (version === "3.x") return CVSS_3_X
  return CVSS_2_0
}

/**
 * Split a vector into its metrics, resolving each abbreviation and value against
 * the dictionary for that vector's version. Unrecognized metrics are kept with
 * their raw text rather than dropped, so a newer/malformed vector still renders.
 */
export function parseCvssVector(vector: string): ParsedMetric[] {
  const version = detectCvssVersion(vector)
  const dict = dictFor(version)

  const segments = vector.split("/")
  const metricSegments = segments[0]?.startsWith("CVSS:") ? segments.slice(1) : segments

  const metrics: ParsedMetric[] = []
  const seenKeys = new Set<string>()
  for (const segment of metricSegments) {
    const sep = segment.indexOf(":")
    if (sep === -1) continue
    const key = segment.slice(0, sep)
    const value = segment.slice(sep + 1)
    if (!key || !value) continue
    // A well-formed vector never repeats a metric; a source with a malformed
    // or doubled-up vector string would otherwise render (and React-key) the
    // same row twice. First occurrence wins, matching how an unrecognized
    // metric is kept rather than dropped elsewhere in this function.
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const def = dict[key]
    metrics.push({
      key,
      label: def?.label ?? key,
      value,
      valueLabel: def?.values[value] ?? value,
      group: def?.group ?? "Base",
    })
  }
  return metrics
}
