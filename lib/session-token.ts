import type { JWT } from "next-auth/jwt"
import { prisma } from "@/lib/db"

/**
 * The session token brought up to date with the user it belongs to, or null to
 * sign the session out (the jwt callback in lib/auth.ts, on every auth() after
 * sign-in).
 *
 * The token is taken only as far as which user it is: whether that user still
 * exists, their role, email and name are read from the database each time. A
 * token kept what sign-in put in it until it expired (30 days), so a deleted
 * user, or an admin made an operator, kept their access that long. A changed
 * password raises sessionVersion, which ends the sessions opened before it.
 */
export async function refreshSessionToken(token: JWT): Promise<JWT | null> {
  if (typeof token.id !== "string") return null
  const current = await prisma.user.findUnique({
    where: { id: token.id },
    select: { email: true, name: true, role: true, sessionVersion: true },
  })
  if (!current || current.sessionVersion !== token.sessionVersion) return null
  return { ...token, role: current.role, email: current.email, name: current.name }
}
