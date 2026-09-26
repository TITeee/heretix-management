"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Check, Ban, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

type ApiToken = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdByEmail: string | null
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const SCOPES = [
  { value: "import", help: "Import an inventory / SBOM (POST /api/assets)." },
  { value: "scan", help: "Run a scan (POST /api/assets/[id]/scan, or ?scan=true on import)." },
]
const LIFETIMES = ["30", "90", "180", "365"]

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

function tokenStatus(t: ApiToken): { label: string; variant: "outline" | "destructive" } {
  if (t.revokedAt) return { label: "Revoked", variant: "destructive" }
  if (new Date(t.expiresAt) <= new Date()) return { label: "Expired", variant: "destructive" }
  return { label: "Active", variant: "outline" }
}

export function ApiTokensTab() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["import", "scan"])
  const [lifetime, setLifetime] = useState("90")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiToken | null>(null)
  const [deleting, setDeleting] = useState(false)

  const applyList = useCallback(async (res: Response) => {
    if (res.status === 403) { setForbidden(true); return }
    if (res.ok) setTokens(await res.json())
  }, [])

  const load = useCallback(() => fetch("/api/settings/api-tokens").then(applyList), [applyList])

  useEffect(() => {
    fetch("/api/settings/api-tokens").then(applyList).catch(() => {})
  }, [applyList])

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault()
    setError("")
    setCreating(true)
    try {
      const res = await fetch("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes, expiresInDays: Number(lifetime) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to create token."); return }
      setCreated({ name: data.name, token: data.token })
      setCopied(false)
      setName("")
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await fetch(`/api/settings/api-tokens/${revokeTarget.id}/revoke`, { method: "POST" })
      setRevokeTarget(null)
      await load()
    } finally {
      setRevoking(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`/api/settings/api-tokens/${deleteTarget.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
  }

  if (forbidden) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Tokens</CardTitle>
          <CardDescription>Only administrators can manage access tokens.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Create Access Token</CardTitle>
          <CardDescription>
            For automation such as CI uploading SBOMs. A token can only call the endpoints its scopes allow.
            It cannot sign in to the console or reach alerts, users, or settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token-name" className="text-sm font-medium">Name</label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. github-actions-myapp"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Scopes</label>
              {SCOPES.map((s) => (
                <div key={s.value} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <input
                      id={`scope-${s.value}`}
                      type="checkbox"
                      checked={scopes.includes(s.value)}
                      onChange={(e) =>
                        setScopes((prev) => e.target.checked ? [...prev, s.value] : prev.filter((v) => v !== s.value))
                      }
                      className="h-4 w-4 rounded border-gray-300 accent-black"
                    />
                    <label htmlFor={`scope-${s.value}`} className="text-sm font-medium">{s.value}</label>
                  </div>
                  <p className="pl-7 text-xs text-muted-foreground">{s.help}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Expires in (days)</label>
              <Select value={lifetime} onValueChange={(v) => { if (v) setLifetime(v) }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIFETIMES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Required. Create a new token before this one expires.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={creating || !name.trim() || scopes.length === 0}>
              {creating ? "Creating..." : "Create Token"}
            </Button>
          </form>

          {created && (
            <div className="mt-6 space-y-2 rounded-md border p-4">
              <p className="text-sm font-medium">Token &ldquo;{created.name}&rdquo; created</p>
              <p className="text-xs text-muted-foreground">
                Copy it now. It is not stored and cannot be shown again.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={created.token} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access Tokens</CardTitle>
          <CardDescription>Send as <code>Authorization: Bearer &lt;token&gt;</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          {tokens === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Token</th>
                  <th className="px-4 py-3 text-left font-medium">Scopes</th>
                  <th className="px-4 py-3 text-left font-medium">Expires</th>
                  <th className="px-4 py-3 text-left font-medium">Last used</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const status = tokenStatus(t)
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {t.name}
                        {t.createdByEmail && <div className="text-xs text-muted-foreground">{t.createdByEmail}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{t.prefix}…</td>
                      <td className="px-4 py-3">{t.scopes.join(", ")}</td>
                      <td className="px-4 py-3 text-muted-foreground" suppressHydrationWarning>{formatDate(t.expiresAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground" suppressHydrationWarning>{t.lastUsedAt ? formatDate(t.lastUsedAt) : "Never"}</td>
                      <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {/* An active token is revoked first; only one that no longer works can be deleted. */}
                        {status.label === "Active" ? (
                          <Button variant="ghost" size="sm" title="Revoke" aria-label={`Revoke ${t.name}`} onClick={() => setRevokeTarget(t)}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" title="Delete" aria-label={`Delete ${t.name}`} onClick={() => setDeleteTarget(t)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Revoke Access Token</DialogTitle>
            <DialogDescription>
              Revoke <strong>{revokeTarget?.name}</strong>? Anything using it will stop working immediately.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={confirmRevoke} disabled={revoking}>
              {revoking ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Access Token</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteTarget?.name}</strong> from the list? It already no longer works.
              Its creation and revocation stay in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
