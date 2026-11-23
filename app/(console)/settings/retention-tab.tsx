"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

import { choicesWith, retentionState, type RetentionCounts, type RetentionTone } from "@/lib/retention-view"

type Counts = RetentionCounts & { minDays: number; keptPerAsset?: number }
type Preview = { audit: Counts; scan: Counts }

const AUDIT_KEY = "AUDIT_RETENTION_DAYS"
const SCAN_KEY = "SCAN_HISTORY_RETENTION_DAYS"

/** The value of "keep everything" in the selector: an empty value cannot be an item's. It is saved as an empty string. */
const KEEP = "keep"
// The periods to choose from, in days. Each is at or above the floor the server enforces.
const AUDIT_CHOICES: [string, string][] = [["90", "90 days"], ["180", "180 days"], ["365", "1 year"], ["730", "2 years"], ["1095", "3 years"], ["1825", "5 years"]]
const SCAN_CHOICES: [string, string][] = [["30", "30 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"], ["730", "2 years"]]

const n = (v: number) => v.toLocaleString("en-US")

const TONE: Record<RetentionTone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200",
  warn: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
}
const BADGE_TONE: Record<RetentionTone, string> = {
  neutral: "",
  ok: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
}

export function RetentionTab() {
  const [loaded, setLoaded] = useState(false)
  const [auditDays, setAuditDays] = useState("")
  const [scanDays, setScanDays] = useState("")
  const [saved, setSaved] = useState({ audit: "", scan: "" })
  // The counts, with the selection they were asked for: after a change they are those of the
  // previous selection until the new ones arrive, and must not be read as the new ones.
  const [preview, setPreview] = useState<{ forKey: string; data: Preview } | null>(null)
  const [previewError, setPreviewError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, string>) => {
        const audit = data[AUDIT_KEY] ?? ""
        const scan = data[SCAN_KEY] ?? ""
        setAuditDays(audit)
        setScanDays(scan)
        setSaved({ audit, scan })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // What the typed periods would delete, asked of the server a moment after typing stops.
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ auditDays: auditDays.trim(), scanDays: scanDays.trim() })
      const forKey = query.toString()
      fetch(`/api/settings/retention?${query}`)
        .then(async (r) => {
          const data = await r.json().catch(() => ({}))
          if (!r.ok) { setPreview(null); setPreviewError(data.error ?? "Could not read the counts"); return }
          setPreview({ forKey, data: data as Preview })
          setPreviewError("")
        })
        .catch(() => { setPreview(null); setPreviewError("Network error") })
    }, 350)
    return () => clearTimeout(timer)
  }, [loaded, auditDays, scanDays])

  const changed = auditDays.trim() !== saved.audit || scanDays.trim() !== saved.scan
  const currentKey = new URLSearchParams({ auditDays: auditDays.trim(), scanDays: scanDays.trim() }).toString()
  const counts = preview?.forKey === currentKey ? preview.data : null
  const willDelete = (counts?.audit.expired ?? 0) + (counts?.scan.expired ?? 0)

  async function save() {
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [AUDIT_KEY]: auditDays.trim(), [SCAN_KEY]: scanDays.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error ?? "Failed to save")
        return
      }
      setSaved({ audit: auditDays.trim(), scan: scanDays.trim() })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch {
      setSaveError("Network error")
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  function section(id: string, title: string, choices: [string, string][], value: string, savedValue: string, set: (v: string) => void, c: Counts | undefined, hint: string) {
    const items = choicesWith(choices, value === "" ? savedValue : value)
    const st = retentionState(c, value)
    const label = (v: string) => (v === KEEP ? "Keep everything" : items.find(([d]) => d === v)?.[1] ?? `${v} days`)
    return (
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-medium">{title}</label>
        <Select value={value === "" ? KEEP : value} onValueChange={(v) => { if (v) set(v === KEEP ? "" : v) }} disabled={!loaded}>
          <SelectTrigger id={id} className="w-56">
            <SelectValue>{(v: string) => label(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={KEEP}>Keep everything</SelectItem>
            {items.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className={`rounded-md border px-3 py-2 text-sm ${TONE[st.tone]}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={BADGE_TONE[st.tone]}>{st.badge}</Badge>
            {value !== savedValue && (
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">Not saved yet</Badge>
            )}
          </div>
          <p className="mt-1">{st.text}</p>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data retention</CardTitle>
        <CardDescription>
          How long the audit log and the scan history are kept. Older rows are deleted once a day. Alerts are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {section(
          "audit-days", "Audit log: keep for", AUDIT_CHOICES, auditDays, saved.audit, setAuditDays, counts?.audit,
          `Minimum ${preview?.data.audit.minDays ?? 90} days. Changes are recorded in the audit log.`,
        )}

        {section(
          "scan-days", "Scan history: keep for", SCAN_CHOICES, scanDays, saved.scan, setScanDays, counts?.scan,
          `Minimum ${preview?.data.scan.minDays ?? 30} days. The last ${preview?.data.scan.keptPerAsset ?? 10} scans of each asset are always kept.`,
        )}

        {previewError && <p className="text-sm text-destructive">{previewError}</p>}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={!loaded || saving || !changed || !counts || !!previewError}
            onClick={() => (willDelete > 0 ? setConfirming(true) : save())}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          {justSaved && <span className="text-sm text-green-600">Saved</span>}
        </div>

        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete old rows?</DialogTitle>
              <DialogDescription>
                {n(counts?.audit.expired ?? 0)} audit log rows and {n(counts?.scan.expired ?? 0)} scan history rows will be
                deleted at the next daily run. Deleted rows can only be restored from a backup.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save and delete"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
