import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { afterLoginPath } from "@/lib/login-redirect"
import { LoginForm } from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const next = afterLoginPath(callbackUrl)

  // Already signed in: the login page has nothing to offer.
  if (await auth()) redirect(next)

  // A callbackUrl means the proxy sent the user here from a page that needs a
  // session (never signed in, expired, or ended by a password change).
  return <LoginForm next={next} fromProtectedPage={!!callbackUrl} />
}
