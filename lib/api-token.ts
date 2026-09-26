import { createHash, randomBytes } from "node:crypto"

/**
 * What an API token may do. Deliberately narrow — each scope is one route —
 * so a leaked CI secret can import SBOMs and trigger scans, and nothing else:
 * no alerts, users, or settings.
 *   import → POST /api/assets (inventory/SBOM import only)
 *   scan   → POST /api/assets/[id]/scan, and POST /api/assets?scan=true
 */
export const API_TOKEN_SCOPES = ["import", "scan"] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

export const TOKEN_PREFIX = "hx_"
export const MAX_TOKEN_LIFETIME_DAYS = 365

export function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return typeof value === "string" && (API_TOKEN_SCOPES as readonly string[]).includes(value)
}

export function generateApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url")
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Who performed a request, for authorization decisions and the audit log. */
export type Actor =
  | { via: "session"; userId: string; userEmail: string }
  | { via: "token"; tokenId: string; tokenName: string; scopes: ApiTokenScope[] }

/** The userId/userEmail pair createAuditLog records for an actor. */
export function auditIdentity(actor: Actor): { userId: string | null; userEmail: string } {
  return actor.via === "session"
    ? { userId: actor.userId, userEmail: actor.userEmail }
    : { userId: null, userEmail: `api-token:${actor.tokenName}` }
}
