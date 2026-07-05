"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import type { SlaConfig } from "@/lib/sla"
import { DEFAULT_SLA_CONFIG } from "@/lib/sla"

type Tag = { id: string; name: string; color: string | null; type: string }

export default function SettingsPage() {
  const [vulnApiUrl, setVulnApiUrl] = useState("")
  const [vulnApiKey, setVulnApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Slack settings
  const [slackEnabled, setSlackEnabled] = useState(false)
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("")
  const [slackMinSeverity, setSlackMinSeverity] = useState("ALL")
  const [slackFilterType, setSlackFilterType] = useState("all")
  const [slackTagIds, setSlackTagIds] = useState<string[]>([])
  const [slackSaving, setSlackSaving] = useState(false)
  const [slackSaved, setSlackSaved] = useState(false)
  const [slackTesting, setSlackTesting] = useState(false)
  const [slackTestResult, setSlackTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [assetTags, setAssetTags] = useState<Tag[]>([])

  // SLA settings
  const [slaConfig, setSlaConfig] = useState<SlaConfig>(DEFAULT_SLA_CONFIG)
  const [slaSaving, setSlaSaving] = useState(false)
  const [slaSaved, setSlaSaved] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) return {}
        return r.json().catch(() => ({}))
      })
      .then((data: Record<string, string>) => {
        setVulnApiUrl(data.HERETIX_API_URL ?? "http://localhost:5000")
        setVulnApiKey(data.HERETIX_API_KEY ?? "")
        setSlackEnabled(data.SLACK_ENABLED === "true")
        setSlackWebhookUrl(data.SLACK_WEBHOOK_URL ?? "")
        setSlackMinSeverity(data.SLACK_MIN_SEVERITY ?? "ALL")
        setSlackFilterType(data.SLACK_FILTER_TYPE ?? "all")
        try { setSlackTagIds(JSON.parse(data.SLACK_TAG_IDS ?? "[]")) } catch { setSlackTagIds([]) }
      })
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : [])
      .then((tags: Tag[]) => setAssetTags(tags))
    fetch("/api/settings/sla")
      .then((r) => r.ok ? r.json() : DEFAULT_SLA_CONFIG)
      .then((config: SlaConfig) => setSlaConfig(config))
  }, [])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ HERETIX_API_URL: vulnApiUrl, HERETIX_API_KEY: vulnApiKey }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSlackSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSlackSaving(true)
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SLACK_ENABLED: slackEnabled ? "true" : "false",
        SLACK_WEBHOOK_URL: slackWebhookUrl,
        SLACK_MIN_SEVERITY: slackMinSeverity,
        SLACK_FILTER_TYPE: slackFilterType,
        SLACK_TAG_IDS: JSON.stringify(slackTagIds),
      }),
    })
    setSlackSaving(false)
    setSlackSaved(true)
    setTimeout(() => setSlackSaved(false), 2000)
  }

  async function handleSlackTest() {
    setSlackTesting(true)
    setSlackTestResult(null)
    try {
      const res = await fetch("/api/settings/slack-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: slackWebhookUrl }),
      })
      const data = await res.json()
      setSlackTestResult(res.ok ? { ok: true, msg: "Message sent" } : { ok: false, msg: data.error ?? "Failed" })
    } catch {
      setSlackTestResult({ ok: false, msg: "Network error" })
    } finally {
      setSlackTesting(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: vulnApiUrl, apiKey: vulnApiKey }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ ok: true, msg: "Connected" })
      } else {
        setTestResult({ ok: false, msg: data.error ?? "Connection failed" })
      }
    } catch {
      setTestResult({ ok: false, msg: "Network error" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSlaSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSlaSaving(true)
    await fetch("/api/settings/sla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slaConfig),
    })
    setSlaSaving(false)
    setSlaSaved(true)
    setTimeout(() => setSlaSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="api" className="w-full">
        <TabsList>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vulnerability API</CardTitle>
          <CardDescription>
            Connection settings for the heretix-api backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="heretix-api-url" className="text-sm font-medium">API URL</label>
              <Input
                id="heretix-api-url"
                value={vulnApiUrl}
                onChange={(e) => setVulnApiUrl(e.target.value)}
                placeholder="http://localhost:5000"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="heretix-api-key" className="text-sm font-medium">API Token</label>
              <Input
                id="heretix-api-key"
                type="password"
                value={vulnApiKey}
                onChange={(e) => setVulnApiKey(e.target.value)}
                placeholder="Leave blank if not required"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || saved}>
                {saved ? "Saved" : saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            </div>

            {testResult && (
              <p className={`text-sm ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                {testResult.msg}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Slack Notifications</CardTitle>
          <CardDescription>
            Send alerts to a Slack channel via Incoming Webhook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSlackSave} className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                id="slack-enabled"
                type="checkbox"
                checked={slackEnabled}
                onChange={(e) => setSlackEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-black"
              />
              <label htmlFor="slack-enabled" className="text-sm font-medium">Enable Slack Notifications</label>
            </div>

            {slackEnabled && (
              <div className="space-y-4 pl-7">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Webhook URL</label>
                  <Input
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Severity</label>
                  <Select value={slackMinSeverity} onValueChange={(v) => { if (v) setSlackMinSeverity(v) }}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Only notify for alerts at or above this severity. KEV alerts always notify.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Assets</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        className="accent-black"
                        name="slack-filter"
                        value="all"
                        checked={slackFilterType === "all"}
                        onChange={() => setSlackFilterType("all")}
                      />
                      All assets
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        className="accent-black"
                        name="slack-filter"
                        value="tag"
                        checked={slackFilterType === "tag"}
                        onChange={() => setSlackFilterType("tag")}
                      />
                      Specific tags
                    </label>
                  </div>
                  {slackFilterType === "tag" && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {slackTagIds.map((id) => {
                          const tag = assetTags.find((t) => t.id === id)
                          if (!tag) return null
                          return (
                            <Badge key={id} variant="outline" className="flex items-center gap-1 text-xs">
                              {tag.name}
                              <button
                                type="button"
                                onClick={() => setSlackTagIds((prev) => prev.filter((x) => x !== id))}
                                className="ml-1 text-muted-foreground hover:text-foreground"
                              >
                                ×
                              </button>
                            </Badge>
                          )
                        })}
                      </div>
                      <Select
                        value=""
                        onValueChange={(v) => { if (v && !slackTagIds.includes(v)) setSlackTagIds((prev) => [...prev, v]) }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Add tag..." />
                        </SelectTrigger>
                        <SelectContent>
                          {assetTags
                            .filter((t) => !slackTagIds.includes(t.id))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={slackSaving || slackSaved}>
                {slackSaved ? "Saved" : slackSaving ? "Saving..." : "Save"}
              </Button>
              {slackEnabled && slackWebhookUrl && (
                <Button type="button" variant="outline" onClick={handleSlackTest} disabled={slackTesting}>
                  {slackTesting ? "Sending..." : "Test"}
                </Button>
              )}
            </div>

            {slackTestResult && (
              <p className={`text-sm ${slackTestResult.ok ? "text-green-600" : "text-destructive"}`}>
                {slackTestResult.msg}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="sla" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>SLA Configuration</CardTitle>
          <CardDescription>
            Set Service Level Agreement timelines for vulnerability alerts based on severity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSlaSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Critical (CVSS 9.0-10)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={slaConfig.slaCriticalHours}
                    onChange={(e) => setSlaConfig({ ...slaConfig, slaCriticalHours: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">High (CVSS 7.0-8.9)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={slaConfig.slaHighHours}
                    onChange={(e) => setSlaConfig({ ...slaConfig, slaHighHours: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Medium (CVSS 4.0-6.9)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={slaConfig.slaMediumDays}
                    onChange={(e) => setSlaConfig({ ...slaConfig, slaMediumDays: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Low (CVSS 0-3.9)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={slaConfig.slaLowDays}
                    onChange={(e) => setSlaConfig({ ...slaConfig, slaLowDays: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium">KEV (Known Exploited Vulnerabilities)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={slaConfig.kevSlaHours}
                  onChange={(e) => setSlaConfig({ ...slaConfig, kevSlaHours: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">hours (override for any CVSS)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button type="submit" disabled={slaSaving || slaSaved}>
                {slaSaved ? "Saved" : slaSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="about" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1">
          <p className="text-base">heretix-management <span className="text-base">v{process.env.NEXT_PUBLIC_VERSION}</span></p>
          <p className="text-base">
            <a href="https://titeee.github.io/heretix-web/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              https://titeee.github.io/heretix-web/
            </a>
          </p>
          <p className="text-xs">Powered by heretix-cli + heretix-api</p>
          <p className="text-xs">Licensed under the Apache License 2.0</p>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
