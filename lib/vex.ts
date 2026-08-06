/**
 * Why an alert was set to `ignored`, and how that maps onto CycloneDX VEX.
 *
 * `ignored` covers more ground than VEX's `not_affected`: a finding can also be
 * a scanner error, or a risk the team knowingly accepts. Recording which one it
 * is keeps the exported document honest, since `analysis.justification` is only
 * meaningful for `not_affected` and asserting one of its nine values about a
 * false positive would be a false claim to whoever consumes the VEX.
 */

export const IGNORE_REASONS = {
  not_affected:  "Not affected",
  false_positive: "False positive",
  accepted_risk: "Accepted risk",
} as const

export type IgnoreReason = keyof typeof IGNORE_REASONS

export const IGNORE_REASON_HINTS: Record<IgnoreReason, string> = {
  not_affected:   "The vulnerable code is present but cannot be exploited here. Requires a justification.",
  false_positive: "The finding itself is wrong, e.g. the scanner matched the wrong package or version.",
  accepted_risk:  "Exploitable, but the team has decided not to act. Recorded internally, not exported as VEX.",
}

export function isIgnoreReason(value: unknown): value is IgnoreReason {
  return typeof value === "string" && value in IGNORE_REASONS
}

/** Only `not_affected` carries a CycloneDX `analysis.justification`. */
export const REASON_REQUIRES_JUSTIFICATION: IgnoreReason = "not_affected"

/**
 * Reasons that produce a VEX statement.
 *
 * `accepted_risk` is withheld on purpose. Its faithful encoding is
 * `state: exploitable` + `response: will_not_fix`, which tells a consumer
 * nothing it can act on while stopping the finding from being suppressed in
 * their scans. Keeping it internal avoids changing downstream behaviour for a
 * statement that carries no useful signal.
 */
export const EXPORTABLE_REASONS: IgnoreReason[] = ["not_affected", "false_positive"]

/**
 * Resolve an alert's VEX analysis state.
 *
 * Rows predating the `ignoreReason` column can still be encountered if one was
 * written by an older build; a justification without a reason meant
 * `not_affected` back then, so it is read that way here.
 */
export function vexStateFor(alert: {
  ignoreReason: string | null
  vexJustification: string | null
}): "not_affected" | "false_positive" | null {
  const reason = alert.ignoreReason ?? (alert.vexJustification ? "not_affected" : null)
  if (reason === "not_affected") return alert.vexJustification ? "not_affected" : null
  if (reason === "false_positive") return "false_positive"
  return null
}
