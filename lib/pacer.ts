/**
 * Spaces out requests so that about `perMinute` start in a minute: never more than
 * `perMinute + 1` in any 60 seconds, since the starts are evenly spaced.
 *
 * heretix-api limits each client address to a number of requests per minute
 * (1,200 by default) and answers the rest with 429. The metadata refresh needs one
 * request per vulnerability, thousands in a row, and everything else heretix-management
 * sends shares that one budget: a refresh that takes all of it leaves the alert detail
 * panel, which does not wait on a 429, with nothing. A pacer below the limit keeps room
 * for them.
 *
 * Requests are given start times `60000 / perMinute` ms apart; a caller waits for its
 * own. Starts are handed out synchronously, so callers running side by side each get a
 * later slot rather than the same one. 0 (or anything not a positive number) means no
 * pacing. `now` and `sleep` can be replaced for tests.
 */
export function createPacer(
  perMinute: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): () => Promise<void> {
  if (!Number.isFinite(perMinute) || perMinute <= 0) return async () => {}
  const interval = 60_000 / perMinute
  let next = 0
  return async () => {
    const t = now()
    const start = Math.max(t, next)
    next = start + interval
    if (start > t) await sleep(start - t)
  }
}
