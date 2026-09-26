import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { isTokenAuthRateLimited, recordTokenAuthFailure } from "@/lib/rate-limit"
import { TOKEN_PREFIX, hashApiToken, isApiTokenScope, type Actor, type ApiTokenScope } from "@/lib/api-token"

// Kept apart from lib/api-token.ts, which holds the pure helpers: this pulls in
// next-auth, which the unit-test environment cannot load.

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown"
}

/**
 * Authenticates a request by session cookie or `Authorization: Bearer hx_...`.
 *
 * Only routes that call this accept tokens at all; every other route still
 * calls `auth()` and so ignores the header. A request that sends a bearer
 * token is judged on that token alone, even if a session cookie is present
 * too, so a script can't pick up a browser session's broader access.
 *
 * `scopes` is what the token must hold for this request; a session user is
 * not scope-limited. Returns the actor, or the error response to send.
 */
export async function authenticate(
  req: NextRequest,
  scopes: ApiTokenScope[],
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const header = req.headers.get("authorization")
  if (!header?.toLowerCase().startsWith("bearer ")) {
    const session = await auth()
    if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
    return { actor: { via: "session", userId: session.user.id, userEmail: session.user.email } }
  }

  const ip = clientIp(req)
  const unauthorized = (reason: string) => {
    recordTokenAuthFailure(ip)
    logger.warn("api token rejected", { reason, ip })
    return { response: NextResponse.json({ error: "Invalid or expired API token" }, { status: 401 }) }
  }
  if (isTokenAuthRateLimited(ip)) {
    return { response: NextResponse.json({ error: "Too many failed API token attempts" }, { status: 429 }) }
  }

  const token = header.slice("bearer ".length).trim()
  if (!token.startsWith(TOKEN_PREFIX)) return unauthorized("malformed")
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } })
  if (!row) return unauthorized("unknown")
  if (row.revokedAt) return unauthorized("revoked")
  if (row.expiresAt <= new Date()) return unauthorized("expired")

  const held = row.scopes.filter(isApiTokenScope)
  const missing = scopes.filter(s => !held.includes(s))
  if (missing.length) {
    return {
      response: NextResponse.json(
        { error: `API token lacks the required scope: ${missing.join(", ")}` },
        { status: 403 },
      ),
    }
  }

  await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
  return { actor: { via: "token", tokenId: row.id, tokenName: row.name, scopes: held } }
}
