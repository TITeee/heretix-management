"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

const MESSAGES = {
  invalid: "The email or password is incorrect.",
  rateLimited: "Too many attempts. Wait up to 15 minutes, then try again.",
  failed: "Could not sign in. Try again, or contact an administrator.",
}

export function LoginForm({ next, fromProtectedPage }: { next: string; fromProtectedPage: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (!result?.error) {
        router.push(next)
        router.refresh()
        return
      }
      // A wrong email and a wrong password get the same message on purpose.
      setError(
        result.code === "rate_limited" ? MESSAGES.rateLimited
          : result.code === "credentials" ? MESSAGES.invalid
          : MESSAGES.failed
      )
    } catch {
      setError(MESSAGES.failed)
    }
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1e293b] dark:bg-background p-4">
      <Card className="w-full max-w-sm gap-6 py-8">
        <div className="space-y-2 px-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/heretix_icon.png" alt="" width={56} height={56} className="mx-auto" />
          <h1 className="text-xl font-semibold tracking-tight">Sign in to heretix</h1>
          <p className="text-sm text-muted-foreground">Vulnerability management console</p>
        </div>
        <CardContent>
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[19rem] space-y-4">
            {fromProtectedPage && !error && (
              <p className="text-center text-sm text-muted-foreground">Sign in to continue.</p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                disabled={loading}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div id="login-error" role="alert" aria-live="polite">
              {error && <p className="text-center text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Forgot your password? Ask an administrator.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
