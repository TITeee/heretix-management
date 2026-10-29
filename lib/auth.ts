import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { authConfig } from "@/lib/auth.config"
import { logger } from "@/lib/logger"
import { createAuditLog } from "@/lib/audit"
import { isLoginRateLimited, recordLoginFailure, clearLoginRateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/client-ip"
import { refreshSessionToken } from "@/lib/session-token"
import { randomBytes } from "node:crypto"

declare module "next-auth" {
  interface User {
    role?: string
    sessionVersion?: number
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: string
    }
  }
}

// Told apart from a wrong password on the sign-in page (the code reaches the
// client). Safe to show: the limit counts attempts per email and address, so it
// says nothing about whether the email has an account.
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited"
}

// Compared against when the email is unknown, so that a sign-in takes as long
// (one bcrypt at cost 12) whether the account exists or not: answering an
// unknown email at once told an attacker which emails have accounts.
let dummyHash: Promise<string> | undefined
function unknownUserHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), 12)
  return dummyHash
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const ip = clientIp(request.headers)

        if (isLoginRateLimited(email, ip)) {
          logger.warn("login failed", { email, reason: "rate_limited", ip })
          await createAuditLog({ userEmail: email, action: "login_failed", detail: `rate limited (IP: ${ip})` })
          throw new RateLimitedSignin()
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          await bcrypt.compare(credentials.password as string, await unknownUserHash())
          recordLoginFailure(email, ip)
          logger.warn("login failed", { email, reason: "user_not_found", ip })
          await createAuditLog({ userEmail: email, action: "login_failed", detail: `user not found (IP: ${ip})` })
          return null
        }

        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) {
          recordLoginFailure(email, ip)
          logger.warn("login failed", { email, reason: "invalid_password", ip })
          await createAuditLog({ userId: user.id, userEmail: email, action: "login_failed", detail: `invalid password (IP: ${ip})` })
          return null
        }

        clearLoginRateLimit(email)
        logger.info("login success", { email, ip })
        await createAuditLog({ userId: user.id, userEmail: email, action: "login", detail: `IP: ${ip}` })
        return { id: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion }
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAuthRoute =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth")
      if (isAuthRoute) return true
      return isLoggedIn
    },
    // Runs on every auth() after sign-in too, and checks the user against the
    // database each time (see lib/session-token.ts); null signs the session out.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.sessionVersion = user.sessionVersion
        return token
      }
      return refreshSessionToken(token)
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
})
