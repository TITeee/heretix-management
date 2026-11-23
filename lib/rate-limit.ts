// In-memory sliding-window limiter for login attempts. Good enough for a
// single-process deployment (this app isn't run on serverless/edge, so state
// persists across requests) — it resets on restart and doesn't share state
// across instances, which is an accepted tradeoff over adding an external
// store just for this.
type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS_PER_EMAIL = 5
const MAX_ATTEMPTS_PER_IP = 20

const emailBuckets = new Map<string, Bucket>()
const ipBuckets = new Map<string, Bucket>()

function isLimited(buckets: Map<string, Bucket>, key: string, max: number): boolean {
  const bucket = buckets.get(key)
  if (!bucket || Date.now() > bucket.resetAt) return false
  return bucket.count >= max
}

function record(buckets: Map<string, Bucket>, key: string): void {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    bucket.count++
  }
}

export function isLoginRateLimited(email: string, ip: string): boolean {
  return (
    isLimited(emailBuckets, email, MAX_ATTEMPTS_PER_EMAIL) ||
    isLimited(ipBuckets, ip, MAX_ATTEMPTS_PER_IP)
  )
}

export function recordLoginFailure(email: string, ip: string): void {
  record(emailBuckets, email)
  record(ipBuckets, ip)
}

export function clearLoginRateLimit(email: string): void {
  emailBuckets.delete(email)
}

// How many failed sign-ins the audit log takes in one window, from however many
// addresses and emails they come. The limits above count per email and per address,
// so a client that picks a new one every time is never stopped by them (without a
// proxy in front it chooses its address too, see lib/client-ip.ts), and a refused
// attempt is cheap, no password is hashed. The audit log is never trimmed, so
// without this cap one client could fill it. Every failure still goes to the
// application log, which Docker rotates.
export const MAX_FAILED_SIGNIN_AUDITS = 50
let failedSignInAuditWindow = { startedAt: 0, count: 0 }

/**
 * What to do with the audit row of a failed sign-in: "record" it, "summarize"
 * (the cap was just passed: write the one row that says the rest are not recorded,
 * so the gap is visible), or "skip" it.
 */
export function claimFailedSignInAudit(now = Date.now()): "record" | "summarize" | "skip" {
  if (now - failedSignInAuditWindow.startedAt >= WINDOW_MS) failedSignInAuditWindow = { startedAt: now, count: 0 }
  failedSignInAuditWindow.count++
  if (failedSignInAuditWindow.count <= MAX_FAILED_SIGNIN_AUDITS) return "record"
  return failedSignInAuditWindow.count === MAX_FAILED_SIGNIN_AUDITS + 1 ? "summarize" : "skip"
}

// Failed API-token authentications, per client IP. A token is 32 random bytes,
// so this isn't guarding against guessing one — it stops a misconfigured CI
// job (a revoked or expired token) from hammering the token lookup, and keeps
// the log from filling with one failure per retry.
const tokenIpBuckets = new Map<string, Bucket>()
const MAX_TOKEN_FAILURES_PER_IP = 20

export function isTokenAuthRateLimited(ip: string): boolean {
  return isLimited(tokenIpBuckets, ip, MAX_TOKEN_FAILURES_PER_IP)
}

export function recordTokenAuthFailure(ip: string): void {
  record(tokenIpBuckets, ip)
}
