import type { NextAuthConfig } from "next-auth"

// The routes that accept an API token (see lib/api-token.ts for the scopes).
// proxy.ts requires a session for everything else, so a bearer request to one
// of these is let through here and the route authenticates the token itself
// (lib/api-auth.ts) — an invalid token is still rejected there, with a 401.
const API_TOKEN_ROUTES = [/^\/api\/assets$/, /^\/api\/assets\/[^/]+\/scan$/]

export function isApiTokenRequest(pathname: string, authorization: string | null): boolean {
  return !!authorization?.toLowerCase().startsWith("bearer ") && API_TOKEN_ROUTES.some(r => r.test(pathname))
}

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: { signIn: "/login" },
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request
      const isLoggedIn = !!auth?.user
      const isAuthRoute =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth")
      if (isAuthRoute) return true
      if (isApiTokenRequest(nextUrl.pathname, request.headers.get("authorization"))) return true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
}
