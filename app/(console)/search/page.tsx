"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Search, ShieldAlert } from "lucide-react"
import { SEVERITY_COLORS } from "@/lib/severity"
import { VulnDetail, NvdTab, OsvTab, AdvisoryTab } from "@/components/alerts/vuln-detail-tabs"

type Vuln = {
  id: string
  externalId: string
  source: string
  severity: string | null
  cvssScore: number | null
  summary: string | null
  publishedAt: string | null
  isKev: boolean
  epssScore: number | null
  epssPercentile: number | null
}

const ECOSYSTEMS = [
  "Ubuntu:20.04:LTS",
  "Ubuntu:22.04:LTS",
  "Ubuntu:24.04:LTS",
  "Debian:11",
  "Debian:12",
  "AlmaLinux:8",
  "AlmaLinux:9",
  "oracle-linux",
  "Alpine:v3.18",
  "Alpine:v3.19",
  "Alpine:v3.20",
  "Alpine:v3.21",
  "PyPI",
  "npm",
  "Go",
  "Maven",
  "NuGet",
]

type SearchMode = "package" | "id" | "cpe"

function SeverityBadge({ score }: { score: number | null }) {
  if (!score) return <Badge variant="outline">Unknown</Badge>
  if (score >= 9.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white">Critical {score.toFixed(1)}</Badge>
  if (score >= 7.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white">High {score.toFixed(1)}</Badge>
  if (score >= 4.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white">Medium {score.toFixed(1)}</Badge>
  return <Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white">Low {score.toFixed(1)}</Badge>
}

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>("package")
  const [pkg, setPkg] = useState("")
  const [version, setVersion] = useState("")
  const [ecosystem, setEcosystem] = useState("All")
  const [vulnId, setVulnId] = useState("")
  const [cpe, setCpe] = useState("")
  const [results, setResults] = useState<Vuln[] | null>(null)
  const [cpeParsed, setCpeParsed] = useState<{ vendor: string; product: string; version: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<VulnDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function handleCardClick(externalId: string) {
    setSelectedId(externalId)
    setDetailData(null)
    setDetailLoading(true)
    const res = await fetch(`/api/search?id=${encodeURIComponent(externalId)}`)
    const data = await res.json()
    setDetailData(data.results?.[0] ?? null)
    setDetailLoading(false)
  }

  async function handleSearch(e: { preventDefault(): void }) {
    e.preventDefault()
    setError("")
    setCpeParsed(null)
    setLoading(true)
    try {
      let q: URLSearchParams
      if (mode === "id") {
        if (!vulnId.trim()) return
        q = new URLSearchParams({ id: vulnId.trim() })
      } else if (mode === "cpe") {
        const cpeTrimmed = cpe.trim()
        if (!cpeTrimmed) return
        const cpeParts = cpeTrimmed.split(":")
        if (
          !cpeTrimmed.startsWith("cpe:2.3:") ||
          cpeParts.length < 5 ||
          !cpeParts[3] || ["*", "-"].includes(cpeParts[3]) ||
          !cpeParts[4] || ["*", "-"].includes(cpeParts[4])
        ) {
          setError("Invalid CPE format. Required: cpe:2.3:<part>:<vendor>:<product>[:<version>...]")
          return
        }
        q = new URLSearchParams({ cpe: cpeTrimmed })
      } else {
        if (!pkg) return
        q = new URLSearchParams({ package: pkg })
        if (version) q.set("version", version)
        if (ecosystem && ecosystem !== "All") q.set("ecosystem", ecosystem)
      }
      const res = await fetch(`/api/search?${q}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      const raw: Vuln[] = data.results ?? []
      const seen = new Set<string>()
      const deduped = raw.filter(v => !seen.has(v.id) && seen.add(v.id))
      deduped.sort((a, b) => {
        if (!a.publishedAt && !b.publishedAt) return 0
        if (!a.publishedAt) return 1
        if (!b.publishedAt) return -1
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      })
      setResults(deduped)
      if (data.parsed) setCpeParsed(data.parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Vulnerability Search</h1>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        <button
          type="button"
          onClick={() => { setMode("package"); setResults(null); setError("") }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "package"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Package
        </button>
        <button
          type="button"
          onClick={() => { setMode("id"); setResults(null); setError("") }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "id"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          CVE / OSV ID
        </button>
        <button
          type="button"
          onClick={() => { setMode("cpe"); setResults(null); setError("") }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "cpe"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          CPE
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        {mode === "package" ? (
          <>
            <Input
              placeholder="Package name (e.g. curl)"
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
              className="w-48"
              required
            />
            <Input
              placeholder="Version (optional)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-36"
            />
            <Select value={ecosystem} onValueChange={(v) => setEcosystem(v ?? "All")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                {ECOSYSTEMS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : mode === "cpe" ? (
          <Input
            placeholder="e.g. cpe:2.3:a:microsoft:windows_10:21h2"
            value={cpe}
            onChange={(e) => setCpe(e.target.value)}
            className="w-96"
            required
          />
        ) : (
          <Input
            placeholder="e.g. CVE-2021-44228 or GHSA-67hx-6x53-jw92"
            value={vulnId}
            onChange={(e) => setVulnId(e.target.value)}
            className="w-80"
            required
          />
        )}
        <Button type="submit" disabled={loading}>
          <Search className="mr-1 h-4 w-4" />
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results !== null && (
        <div className="space-y-3">
          {cpeParsed && (
            <p className="text-sm text-muted-foreground">
              vendor: <span className="font-mono">{cpeParsed.vendor}</span> / product: <span className="font-mono">{cpeParsed.product}</span>
              {cpeParsed.version && <> / version: <span className="font-mono">{cpeParsed.version}</span></>}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{results.length} result(s)</p>
          {results.length === 0 ? (
            <p className="text-sm">No vulnerabilities found.</p>
          ) : (
            results.map((v) => (
              <Card key={v.id ?? v.externalId ?? vulnId} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleCardClick(v.externalId ?? vulnId.trim())}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {v.isKev && (
                        <span title="CISA Known Exploited Vulnerability">
                          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                        </span>
                      )}
                      <span className="font-mono font-medium text-sm">{v.externalId}</span>
                      <Badge variant="outline" className="text-xs">{v.source}</Badge>
                    </div>
                    <SeverityBadge score={v.cvssScore} />
                  </div>
                  {v.summary && (
                    <p className="text-sm text-muted-foreground">{v.summary}</p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {v.publishedAt && (
                      <span suppressHydrationWarning>Published: {new Date(v.publishedAt).toLocaleDateString()}</span>
                    )}
                    {v.epssScore != null && (
                      <span>EPSS: {v.epssScore.toFixed(3)} ({(v.epssPercentile! * 100).toFixed(0)}th pct)</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        <DialogContent className="max-w-6xl sm:max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedId}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="nvd">
            <TabsList>
              <TabsTrigger value="nvd">NVD</TabsTrigger>
              <TabsTrigger value="osv">OSV</TabsTrigger>
              {(detailData?.advisoryVulnerabilities?.length ?? 0) > 0 && (
                <TabsTrigger value="advisory">Advisory</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="nvd" className="mt-4">
              <NvdTab detail={detailData} loading={detailLoading} />
            </TabsContent>
            <TabsContent value="osv" className="mt-4">
              <OsvTab detail={detailData} loading={detailLoading} />
            </TabsContent>
            <TabsContent value="advisory" className="mt-4">
              <AdvisoryTab detail={detailData} loading={detailLoading} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
