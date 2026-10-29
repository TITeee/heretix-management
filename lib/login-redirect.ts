/**
 * Where to go after signing in: the page the user first asked for, which the
 * proxy passes as ?callbackUrl=. Only the path and query are kept, so a crafted
 * link (an absolute URL, //host/path) cannot send the user to another site.
 */
export function afterLoginPath(callbackUrl: string | null | undefined): string {
  if (!callbackUrl) return "/"
  let url: URL
  try {
    url = new URL(callbackUrl, "http://localhost")
  } catch {
    return "/"
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "/"
  const { pathname, search } = url
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/api/")) return "/"
  return pathname + search
}
