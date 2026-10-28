/**
 * The client's address, for rate limits and logs.
 *
 * A route handler cannot see the connecting socket; Next.js passes it on in
 * X-Forwarded-For, but only when the request did not carry that header
 * already. A reverse proxy in front appends the address it was connected from,
 * so the last entry is the one no client can choose. The first entry, taken
 * before, is whatever the client sent, and a client could pick a fresh
 * address for every login attempt to get round the per-address limit.
 *
 * Without a proxy in front a client that sends the header still chooses the
 * address; the per-address limit holds only with a proxy (which TLS needs
 * anyway).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  const last = forwarded?.split(",").map(s => s.trim()).filter(Boolean).pop()
  return last || "unknown"
}
