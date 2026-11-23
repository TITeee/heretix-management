import { createAuditLog } from "@/lib/audit"
import { claimFailedSignInAudit, MAX_FAILED_SIGNIN_AUDITS } from "@/lib/rate-limit"
import { MAX_IP_LENGTH } from "@/lib/client-ip"

/** The longest email address there can be (RFC 5321). The sign-in limiter and the logs keep no more of what a client sent as one. */
export const MAX_EMAIL_LENGTH = 254
export function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * Records a failed sign-in in the audit log, within the cap of claimFailedSignInAudit
 * and with the email and address cut to a sane length, since both come from the client.
 */
export async function auditFailedSignIn(
  params: { userId?: string | null; email: string; reason: string; ip: string },
  now?: number
): Promise<void> {
  const decision = claimFailedSignInAudit(now)
  if (decision === "skip") return
  if (decision === "summarize") {
    await createAuditLog({
      action: "login_failed",
      detail: `more than ${MAX_FAILED_SIGNIN_AUDITS} failed sign-ins in 15 minutes; the rest are not recorded here, see the application log`,
    })
    return
  }
  await createAuditLog({
    userId: params.userId ?? null,
    userEmail: clip(params.email, MAX_EMAIL_LENGTH),
    action: "login_failed",
    detail: `${params.reason} (IP: ${clip(params.ip, MAX_IP_LENGTH)})`,
  })
}
