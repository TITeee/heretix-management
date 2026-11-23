// In-memory sliding-window limiter for login attempts. Good enough for a
// single-process deployment (this app isn't run on serverless/edge, so state
// persists across requests) — it resets on restart and doesn't share state
// across instances, which is an accepted tradeoff over adding an external
// store just for this.
type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS_PER_EMAIL = 5
const MAX_ATTEMPTS_PER_IP = 20

// A bucket is made by a failed attempt and, once its window is over, has nothing left to say,
// so a client that tries a new email or address every time makes buckets nobody reads again.
// Without a sweep they pile up until the process restarts. The limiters therefore sweep what
// has expired (at most once a minute, by the next failure, so there is no timer), and keep at
// most MAX_BUCKETS of each kind: past that the oldest windows go first. A cap is a trade:
// pushing a real email's bucket out takes that many failed attempts inside one window, and each
// one of them costs a password hash (the token limiter has no such cost, which is why it
// needs the cap most).
export const MAX_BUCKETS = 20_000
const SWEEP_EVERY_MS = 60 * 1000

const emailBuckets = new Map<string, Bucket>()
const ipBuckets = new Map<string, Bucket>()
const lastSweep = new WeakMap<Map<string, Bucket>, number>()

function isLimited(buckets: Map<string, Bucket>, key: string, max: number): boolean {
  const bucket = buckets.get(key)
  if (!bucket || Date.now() > bucket.resetAt) return false
  return bucket.count >= max
}

function sweep(buckets: Map<string, Bucket>, now: number): void {
  if (now - (lastSweep.get(buckets) ?? 0) < SWEEP_EVERY_MS) return
  lastSweep.set(buckets, now)
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key)
  }
}

function record(buckets: Map<string, Bucket>, key: string): void {
  const now = Date.now()
  sweep(buckets, now)
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    // Deleted first, so that a window that starts again goes to the end of the map's order:
    // that order is the order of the windows' ends, and the cap drops from its front.
    buckets.delete(key)
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    while (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value
      if (oldest === undefined) break
      buckets.delete(oldest)
    }
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

/** How many buckets each limiter holds, for tests and for looking into a process that grows. */
export function rateLimitBucketCounts(): { email: number; ip: number; token: number } {
  return { email: emailBuckets.size, ip: ipBuckets.size, token: tokenIpBuckets.size }
}
