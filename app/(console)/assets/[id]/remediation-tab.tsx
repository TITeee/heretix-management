"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { FaTriangleExclamation } from "react-icons/fa6"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SeverityBadge, StatusBadge } from "@/components/ui/severity-badge"
import { AlertDetailSheet, type SheetAlert } from "@/components/alerts/alert-detail-sheet"
import { SEVERITY_COLORS, type SeverityCounts, type SeverityTier } from "@/lib/severity"
import { fixStatusLabel } from "@/lib/fix-status"
import { compareAlertUrgency, type NoFixGroup, type RemediationAction, type RemediationKind, type RemediationPlan } from "@/lib/remediation"

type ApiAlert = Omit<SheetAlert, "detectedAt" | "dueDate" | "resolvedAt"> & {
  detectedAt: string
  dueDate: string | null
  resolvedAt: string | null
}

function toSheetAlert(a: ApiAlert): SheetAlert {
  return {
    ...a,
    detectedAt: new Date(a.detectedAt),
    dueDate: a.dueDate ? new Date(a.dueDate) : null,
    resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : null,
  }
}

const KIND_LABELS: Record<RemediationKind, string> = {
  os_update: "OS package",
  direct_upgrade: "Direct dependency",
  via_direct: "Transitive dependency",
  go_rebuild: "Go toolchain",
  package_update: "Package",
  product_update: "Product / firmware",
}

function actionTitle(a: RemediationAction): string {
  switch (a.kind) {
    case "os_update": return `Update ${a.target}`
    case "direct_upgrade": return `Upgrade ${a.target}`
    case "via_direct": return `Upgrade through ${a.roots.join(", ")}`
    case "go_rebuild": return "Rebuild Go binaries with a newer Go"
    case "package_update": return `Update ${a.target}`
    case "product_update": return `Update ${a.target}`
  }
}

const TIERS: SeverityTier[] = ["critical", "high", "medium", "low", "na"]

function SeverityCountBadges({ counts }: { counts: SeverityCounts }) {
  return (
    <span className="flex items-center gap-1">
      {TIERS.filter((t) => counts[t] > 0).map((t) => (
        <Badge
          key={t}
          style={{ backgroundColor: SEVERITY_COLORS[t] }}
          className={`rounded-md ${t === "na" ? "text-neutral-900" : "text-white"}`}
          title={`${counts[t]} ${t === "na" ? "N/A" : t}`}
        >
          {counts[t]}
        </Badge>
      ))}
    </span>
  )
}

function KevBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    // Icon only, as on the Alerts list; the count is in the tooltip.
    <span title={`${count} CISA Known Exploited ${count === 1 ? "Vulnerability" : "Vulnerabilities"}`}>
      <FaTriangleExclamation className="h-4 w-4 text-red-600" />
    </span>
  )
}

function AlertList({ ids, alerts, onSelect }: { ids: string[]; alerts: Map<string, ApiAlert>; onSelect: (a: ApiAlert) => void }) {
  const sorted = ids
    .map((id) => alerts.get(id))
    .filter((a): a is ApiAlert => !!a)
    .sort(compareAlertUrgency)
  return (
    <table className="mt-2 w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b">
          <th className="py-1.5 text-left font-medium">Vulnerability</th>
          <th className="py-1.5 text-left font-medium">Package</th>
          <th className="py-1.5 text-left font-medium">Severity</th>
          <th className="py-1.5 text-left font-medium">Fixed in</th>
          <th className="py-1.5 text-left font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((a) => {
          return (
            <tr key={a.id} className="border-b last:border-0 cursor-pointer hover:bg-muted/50" onClick={() => onSelect(a)}>
              <td className="py-1.5 font-mono"><span className="inline-flex items-center gap-1.5">{a.externalId}{a.isKev && (
                <span title="CISA Known Exploited Vulnerability"><FaTriangleExclamation className="h-3.5 w-3.5 text-red-600" /></span>
              )}</span></td>
              <td className="py-1.5">{a.packageName} <span className="text-muted-foreground">{a.packageVersion}</span></td>
              <td className="py-1.5"><SeverityBadge severity={a.severity} score={a.cvssScore} /></td>
              <td className="py-1.5 font-mono">{a.fixedVersion ?? <span className="font-sans text-muted-foreground">None</span>}</td>
              <td className="py-1.5"><StatusBadge status={a.status} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ActionRow({ action, alerts, onSelect }: { action: RemediationAction; alerts: Map<string, ApiAlert>; onSelect: (a: ApiAlert) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-md border px-4 py-3">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{actionTitle(action)}</span>
            <Badge variant="outline" className="text-xs font-normal">{KIND_LABELS[action.kind]}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {action.kind === "via_direct" && <>Vulnerable: {action.packages.join(", ")}. </>}
            {/* Same treatment as "Fixed in" in the alert detail panel. */}
            Fixed in <span className="font-mono font-semibold text-green-700 dark:text-green-400">{action.fixedVersions.join(", ")}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <KevBadge count={action.kev} />
          <SeverityCountBadges counts={action.severities} />
          <span className="w-16 text-right text-sm tabular-nums">{action.alertIds.length} {action.alertIds.length === 1 ? "alert" : "alerts"}</span>
        </div>
      </button>
      {expanded && <AlertList ids={action.alertIds} alerts={alerts} onSelect={onSelect} />}
    </div>
  )
}

function distroRatingSummary(group: NoFixGroup): string {
  return Object.entries(group.distroPriorities)
    .sort((a, b) => b[1] - a[1])
    .map(([rating, n]) => `${rating || "unrated"} ${n}`)
    .join(", ")
}

function AcceptDialog({ assetId, group, open, onOpenChange, onAccepted }: {
  assetId: string
  group: NoFixGroup
  open: boolean
  onOpenChange: (v: boolean) => void
  onAccepted: () => void
}) {
  const [memo, setMemo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleAccept() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/assets/${assetId}/remediation/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds: group.alertIds, memo }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Failed to accept the alerts.")
        return
      }
      onOpenChange(false)
      onAccepted()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept {group.alertIds.length} alerts with no fix</DialogTitle>
          <DialogDescription>
            They become <strong>Ignored</strong> with the reason <strong>Accepted risk</strong>, which is not
            included in the VEX export. Each one reopens automatically when a scan finds a fixed version for it.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Memo (optional), recorded on each alert's timeline"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        {group.kev > 0 && (
          <p className="text-sm text-red-600">
            {group.kev} of these {group.kev === 1 ? "is a known exploited vulnerability" : "are known exploited vulnerabilities"} (KEV).
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleAccept} disabled={loading}>{loading ? "Accepting..." : "Accept"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoFixRow({ assetId, group, alerts, onSelect, onAccepted }: {
  assetId: string
  group: NoFixGroup
  alerts: Map<string, ApiAlert>
  onSelect: (a: ApiAlert) => void
  onAccepted: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [accepting, setAccepting] = useState(false)
  return (
    <div className="rounded-md border px-4 py-3">
      <div className="flex items-start gap-3">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-1">
            <span className="font-medium">{fixStatusLabel(group.fixStatus) ?? "No fix status given"}</span>
            <div className="text-xs text-muted-foreground">Distro rating: {distroRatingSummary(group)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <KevBadge count={group.kev} />
            <SeverityCountBadges counts={group.severities} />
            <span className="w-16 text-right text-sm tabular-nums">{group.alertIds.length} {group.alertIds.length === 1 ? "alert" : "alerts"}</span>
          </div>
        </button>
        <Button size="sm" onClick={() => setAccepting(true)}>Accept</Button>
      </div>
      {expanded && <AlertList ids={group.alertIds} alerts={alerts} onSelect={onSelect} />}
      <AcceptDialog assetId={assetId} group={group} open={accepting} onOpenChange={setAccepting} onAccepted={onAccepted} />
    </div>
  )
}

export function RemediationTab({ assetId }: { assetId: string }) {
  const router = useRouter()
  const [data, setData] = useState<{ plan: RemediationPlan; acceptedWithFix: RemediationAction[]; alerts: Map<string, ApiAlert> } | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<SheetAlert | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/assets/${assetId}/remediation`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json() as Promise<{ plan: RemediationPlan; acceptedWithFix: RemediationAction[]; alerts: ApiAlert[] }>
      })
      .then((body) => {
        if (cancelled) return
        setData({ plan: body.plan, acceptedWithFix: body.acceptedWithFix, alerts: new Map(body.alerts.map((a) => [a.id, a])) })
        setError(false)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [assetId, version])

  // Changes made here also move the counts elsewhere on the asset page.
  const reload = useCallback(() => {
    setVersion((v) => v + 1)
    router.refresh()
  }, [router])

  if (error) return <p className="text-sm text-destructive">Failed to load the remediation plan.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>

  const { plan, acceptedWithFix, alerts } = data
  const actionCount = plan.actions.reduce((n, a) => n + a.alertIds.length, 0)
  const noFixCount = plan.noFix.reduce((n, g) => n + g.alertIds.length, 0)

  const openCount = actionCount + noFixCount
  const acceptedCount = acceptedWithFix.reduce((n, a) => n + a.alertIds.length, 0)

  if (openCount === 0 && acceptedCount === 0) {
    return <p className="text-sm text-muted-foreground">No open alerts.</p>
  }

  const select = (a: ApiAlert) => { setSelected(toSheetAlert(a)); setSheetOpen(true) }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {openCount === 0
          ? "No open alerts."
          : <>{openCount} open alerts: {actionCount} fixable through {plan.actions.length}{" "}
            {plan.actions.length === 1 ? "change" : "changes"}, {noFixCount} with no fix available.</>}
      </p>

      {openCount > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Changes to make ({plan.actions.length})</h2>
          {plan.actions.length === 0
            ? <p className="text-sm text-muted-foreground">None. No open alert has a fixed version.</p>
            : plan.actions.map((a) => <ActionRow key={a.key} action={a} alerts={alerts} onSelect={select} />)}
        </section>
      )}

      {acceptedWithFix.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Accepted, but a fix is now available ({acceptedCount})</h2>
          <p className="text-xs text-muted-foreground">
            Ignored as accepted risk, and a fixed version has since appeared. They stay ignored; open an alert to
            reconsider it.
          </p>
          {acceptedWithFix.map((a) => <ActionRow key={a.key} action={a} alerts={alerts} onSelect={select} />)}
        </section>
      )}

      {plan.noFix.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">No fix available ({noFixCount})</h2>
          <p className="text-xs text-muted-foreground">
            No upgrade resolves these yet. Grouped by the distro&apos;s fix status: accept a group, or leave it open to wait for a fix.
          </p>
          {plan.noFix.map((g) => (
            <NoFixRow key={g.key} assetId={assetId} group={g} alerts={alerts} onSelect={select} onAccepted={reload} />
          ))}
        </section>
      )}

      <AlertDetailSheet
        key={selected?.id}
        alert={selected}
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) reload() }}
        onStatusChange={() => {}}
      />
    </div>
  )
}
