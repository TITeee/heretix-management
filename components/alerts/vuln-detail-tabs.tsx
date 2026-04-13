"use client"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SEVERITY_COLORS } from "@/lib/severity"

export type NvdPackage = {
  cpe: string | null
  vendor: string | null
  packageName: string
  ecosystem: string | null
  versionStartIncluding: string | null
  versionStartExcluding: string | null
  versionEndIncluding: string | null
  versionEndExcluding: string | null
}

export type OsvPackage = {
  ecosystem: string
  packageName: string
  introducedVersion: string | null
  fixedVersion: string | null
  lastAffectedVersion: string | null
}

export type CvssMetric = {
  source: string
  type: string
  cvssData: { vectorString: string; baseScore: number; baseSeverity: string }
  exploitabilityScore: number
  impactScore: number
}

export type NvdRawData = {
  vulnStatus?: string
  references?: Array<{ url: string; source?: string; tags?: string[] }>
  weaknesses?: Array<{ type: string; description: Array<{ lang: string; value: string }> }>
  metrics?: {
    cvssMetricV31?: CvssMetric[]
    cvssMetricV2?: CvssMetric[]
  }
}

export type OsvRawData = {
  details?: string
  references?: Array<{ type: string; url: string }>
  affected?: Array<{ versions?: string[] }>
  severity?: Array<{ type: string; score: string }>
}

export type AdvisoryAffectedProduct = {
  vendor: string
  product: string
  versionStart: string | null
  versionEnd: string | null
  versionFixed: string | null
  affectedVersions: string[]
  patchAvailable: boolean | null
}

export type AdvisoryVulnerability = {
  id: string
  source: string
  externalId: string
  cveId: string | null
  severity: string | null
  cvssScore: number | null
  cvssVector: string | null
  summary: string | null
  description: string | null
  url: string | null
  workaround: string | null
  solution: string | null
  publishedAt: string | null
  affectedProducts: AdvisoryAffectedProduct[]
}

export type VulnDetail = {
  cveId: string | null
  osvId: string | null
  kevDateAdded: string | null
  kevDueDate: string | null
  kevProduct: string | null
  kevVendor: string | null
  kevShortDesc: string | null
  kevRequiredAction: string | null
  nvdVulnerability: {
    cveId: string
    severity: string | null
    cvssScore: number | null
    cvssVector: string | null
    summary: string | null
    publishedAt: string | null
    modifiedAt: string | null
    affectedPackages: NvdPackage[]
    rawData: NvdRawData
  } | null
  osvVulnerabilities: Array<{
    osvId: string
    aliases: unknown
    ecosystem: string | null
    packageName: string | null
    summary: string | null
    publishedAt: string | null
    severity: string | null
    affectedPackages: OsvPackage[]
    rawData: OsvRawData
  }>
  advisoryVulnerabilities: AdvisoryVulnerability[]
}

export function SeverityBadge({ score }: { score: number | null }) {
  if (!score) return <Badge variant="outline">n/a</Badge>
  if (score >= 9.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.critical }} className="text-white">{score.toFixed(1)}</Badge>
  if (score >= 7.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.high }} className="text-white">{score.toFixed(1)}</Badge>
  if (score >= 4.0) return <Badge style={{ backgroundColor: SEVERITY_COLORS.medium }} className="text-white">{score.toFixed(1)}</Badge>
  return <Badge style={{ backgroundColor: SEVERITY_COLORS.low }} className="text-white">{score.toFixed(1)}</Badge>
}

export function DetailSkeleton() {
  return (
    <div className="space-y-3 p-1">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-16 w-full mt-4" />
    </div>
  )
}

function NvdRefTag({ tag }: { tag: string }) {
  const lower = tag.toLowerCase()
  if (lower === "patch") return <Badge className="bg-green-600 text-white text-xs">{tag}</Badge>
  if (lower === "exploit") return <Badge className="bg-red-600 text-white text-xs">{tag}</Badge>
  if (lower.includes("vendor advisory")) return <Badge className="bg-blue-600 text-white text-xs">{tag}</Badge>
  return <Badge variant="outline" className="text-xs">{tag}</Badge>
}

export function NvdTab({ detail, loading, error }: { detail: VulnDetail | null; loading: boolean; error?: boolean }) {
  if (loading) return <DetailSkeleton />

  const nvd = detail?.nvdVulnerability
  if (!nvd) {
    return <p className="text-sm text-muted-foreground py-2">{error ? "Failed to retrieve data from heretix-api." : "No NVD data available."}</p>
  }

  const raw = nvd.rawData
  const allCvssMetrics = [
    ...(raw?.metrics?.cvssMetricV31 ?? []).map(m => ({ ...m, version: "3.1" })),
    ...(raw?.metrics?.cvssMetricV2 ?? []).map(m => ({ ...m, version: "2.0" })),
  ]

  return (
    <div className="space-y-6 text-sm">
      {/* Details */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
        <div className="space-y-2">
          {raw?.vulnStatus && (
            <div className="flex items-center gap-2">
              <span className="w-28 text-muted-foreground shrink-0">Status</span>
              <span>{raw.vulnStatus}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-28 text-muted-foreground shrink-0">CVSS</span>
            <div className="flex items-center gap-2">
              <SeverityBadge score={nvd.cvssScore} />
              {nvd.cvssVector && (
                <span className="font-mono text-xs text-muted-foreground break-all">{nvd.cvssVector}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 text-muted-foreground shrink-0">Severity</span>
            <span>{nvd.severity ?? "n/a"}</span>
          </div>
          {nvd.publishedAt && (
            <div className="flex items-center gap-2">
              <span className="w-28 text-muted-foreground shrink-0">Published</span>
              <span>{new Date(nvd.publishedAt).toLocaleDateString("en-US")}</span>
            </div>
          )}
          {nvd.modifiedAt && (
            <div className="flex items-center gap-2">
              <span className="w-28 text-muted-foreground shrink-0">Modified</span>
              <span>{new Date(nvd.modifiedAt).toLocaleDateString("en-US")}</span>
            </div>
          )}
          {nvd.summary && (
            <div className="flex gap-2">
              <span className="w-28 text-muted-foreground shrink-0">Summary</span>
              <span className="text-xs leading-relaxed">{nvd.summary}</span>
            </div>
          )}
        </div>
      </section>

      {/* CVSS Metrics */}
      {allCvssMetrics.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CVSS Metrics</h3>
          <div className="space-y-3">
            {allCvssMetrics.map((m, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">CVSS v{m.version}</Badge>
                  <Badge variant={m.type === "Primary" ? "secondary" : "outline"}>{m.type}</Badge>
                  <span className="text-muted-foreground">{m.source}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Base Score</span>
                    <SeverityBadge score={m.cvssData.baseScore} />
                    <span className="text-muted-foreground">{m.cvssData.baseSeverity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Exploitability</span>
                    <span className="font-mono">{m.exploitabilityScore?.toFixed(2) ?? "n/a"}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="text-muted-foreground">Impact</span>
                    <span className="font-mono">{m.impactScore?.toFixed(2) ?? "n/a"}</span>
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <span className="text-muted-foreground shrink-0">Vector</span>
                    <span className="font-mono break-all">{m.cvssData.vectorString}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CISA KEV */}
      {detail?.kevProduct && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CISA KEV</h3>
          <div className="space-y-2">
            {detail.kevVendor && (
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Vendor</span>
                <span>{detail.kevVendor}</span>
              </div>
            )}
            {detail.kevProduct && (
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Product</span>
                <span>{detail.kevProduct}</span>
              </div>
            )}
            {detail.kevShortDesc && (
              <div className="flex gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Description</span>
                <span className="text-xs leading-relaxed">{detail.kevShortDesc}</span>
              </div>
            )}
            {detail.kevRequiredAction && (
              <div className="flex gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Action Required</span>
                <span className="text-xs leading-relaxed">{detail.kevRequiredAction}</span>
              </div>
            )}
            {detail.kevDueDate && (
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Due Date</span>
                <span className="text-red-600 font-medium">{new Date(detail.kevDueDate).toLocaleDateString("en-US")}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CWE */}
      {raw?.weaknesses && raw.weaknesses.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weaknesses (CWE)</h3>
          <div className="flex flex-wrap gap-2">
            {raw.weaknesses.map((w, i) =>
              w.description.filter(d => d.lang === "en").map((d, j) => (
                <div key={`${i}-${j}`} className="flex items-center gap-1.5">
                  <Badge variant={w.type === "Primary" ? "secondary" : "outline"} className="font-mono">{d.value}</Badge>
                  <span className="text-xs text-muted-foreground">{w.type}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {nvd.affectedPackages.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Affected Packages ({nvd.affectedPackages.length})</h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Vendor / Product</th>
                  <th className="px-3 py-2 text-left font-medium">Version Range</th>
                  <th className="px-3 py-2 text-left font-medium">CPE</th>
                </tr>
              </thead>
              <tbody>
                {nvd.affectedPackages.map((pkg, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{pkg.packageName}</div>
                      {pkg.vendor && <div className="text-muted-foreground">{pkg.vendor}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {pkg.versionStartIncluding && <div>≥ {pkg.versionStartIncluding}</div>}
                      {pkg.versionStartExcluding && <div>&gt; {pkg.versionStartExcluding}</div>}
                      {pkg.versionEndIncluding && <div>≤ {pkg.versionEndIncluding}</div>}
                      {pkg.versionEndExcluding && <div>&lt; {pkg.versionEndExcluding}</div>}
                      {!pkg.versionStartIncluding && !pkg.versionStartExcluding && !pkg.versionEndIncluding && !pkg.versionEndExcluding && <span>n/a</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground max-w-[160px] truncate" title={pkg.cpe ?? ""}>
                      {pkg.cpe ?? "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* References */}
      {raw?.references && raw.references.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">References ({raw.references.length})</h3>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {raw.references.map((ref, i) => (
              <div key={i} className="px-3 py-2 space-y-1">
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline break-all"
                >
                  {ref.url}
                </a>
                <div className="flex flex-wrap items-center gap-1">
                  {ref.source && <span className="text-xs text-muted-foreground">{ref.source}</span>}
                  {ref.tags?.map((tag) => <NvdRefTag key={tag} tag={tag} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function OsvRefBadge({ type }: { type: string }) {
  const upper = type.toUpperCase()
  if (upper === "FIX") return <Badge className="bg-green-600 text-white text-xs shrink-0">FIX</Badge>
  if (upper === "ADVISORY") return <Badge className="bg-blue-600 text-white text-xs shrink-0">ADVISORY</Badge>
  if (upper === "REPORT") return <Badge className="bg-orange-500 text-white text-xs shrink-0">REPORT</Badge>
  return <Badge variant="outline" className="text-xs shrink-0">{type}</Badge>
}

export function OsvTab({ detail, loading, error }: { detail: VulnDetail | null; loading: boolean; error?: boolean }) {
  if (loading) return <DetailSkeleton />

  const osvList = detail?.osvVulnerabilities ?? []
  if (osvList.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">{error ? "Failed to retrieve data from heretix-api." : "No OSV data available."}</p>
  }

  return (
    <div className="space-y-6 text-sm">
      {osvList.map((osv) => (
        <div key={osv.osvId} className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">OSV ID</span>
                <span className="font-mono text-xs">{osv.osvId}</span>
              </div>
              {Array.isArray(osv.aliases) && osv.aliases.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Aliases</span>
                  <div className="flex flex-wrap gap-1">
                    {(osv.aliases as string[]).map((a) => (
                      <Badge key={a} variant="outline" className="font-mono text-xs">{a}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {osv.ecosystem && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Ecosystem</span>
                  <span>{osv.ecosystem}</span>
                </div>
              )}
              {osv.publishedAt && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Published</span>
                  <span>{new Date(osv.publishedAt).toLocaleDateString("en-US")}</span>
                </div>
              )}
              {osv.rawData?.severity?.some(s => s.score.startsWith("CVSS:")) && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">CVSS</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {osv.rawData.severity
                      .filter(s => s.score.startsWith("CVSS:"))
                      .map((s, i) => (
                        <span key={i} className="font-mono text-xs text-muted-foreground break-all">
                          {s.score}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Severity</span>
                <span>{osv.severity ?? "n/a"}</span>
              </div>
              {osv.summary && (
                <div className="flex gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Summary</span>
                  <span className="text-xs leading-relaxed">{osv.summary}</span>
                </div>
              )}
            </div>
          </section>

          {/* OSV Details (long description) */}
          {osv.rawData?.details && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{osv.rawData.details}</p>
            </section>
          )}

          {osv.affectedPackages.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Affected Packages ({osv.affectedPackages.length})</h3>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Ecosystem / Package</th>
                      <th className="px-3 py-2 text-left font-medium">Introduced</th>
                      <th className="px-3 py-2 text-left font-medium">Fixed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {osv.affectedPackages.map((pkg, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{pkg.packageName}</div>
                          <div className="text-muted-foreground">{pkg.ecosystem}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {pkg.introducedVersion ?? "n/a"}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {pkg.fixedVersion ?? pkg.lastAffectedVersion ?? "n/a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Specific Versions */}
          {(() => {
            const versions = [...new Set(
              (osv.rawData?.affected ?? []).flatMap(a => a.versions ?? [])
            )]
            if (versions.length === 0) return null
            return (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specific Affected Versions ({versions.length})</h3>
                <div className="max-h-32 overflow-y-auto rounded-md border p-2 grid grid-cols-3 gap-1">
                  {versions.map((v) => (
                    <span key={v} className="font-mono text-xs text-muted-foreground">{v}</span>
                  ))}
                </div>
              </section>
            )
          })()}

          {/* References */}
          {osv.rawData?.references && osv.rawData.references.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">References ({osv.rawData.references.length})</h3>
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {osv.rawData.references.map((ref, i) => (
                  <div key={i} className="px-3 py-2 flex items-start gap-2">
                    <OsvRefBadge type={ref.type} />
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {ref.url}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ))}
    </div>
  )
}

export function AdvisoryTab({ detail, loading }: { detail: VulnDetail | null; loading: boolean }) {
  if (loading) return <DetailSkeleton />

  const advisories = detail?.advisoryVulnerabilities ?? []
  if (advisories.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No Advisory data available.</p>
  }

  return (
    <div className="space-y-6 text-sm">
      {advisories.map((adv) => (
        <div key={adv.id} className="space-y-4">
          {/* Header */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Source</span>
                <Badge variant="outline" className="capitalize">{adv.source}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">Advisory ID</span>
                <span className="font-mono text-xs">{adv.externalId}</span>
              </div>
              {adv.cveId && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">CVE</span>
                  <span className="font-mono text-xs">{adv.cveId}</span>
                </div>
              )}
              {adv.publishedAt && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Published</span>
                  <span>{new Date(adv.publishedAt).toLocaleDateString("en-US")}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground shrink-0">CVSS</span>
                <div className="flex items-center gap-2">
                  <SeverityBadge score={adv.cvssScore} />
                  {adv.cvssVector && (
                    <span className="font-mono text-xs text-muted-foreground break-all">{adv.cvssVector}</span>
                  )}
                </div>
              </div>
              {adv.severity && (
                <div className="flex items-center gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Severity</span>
                  <span>{adv.severity}</span>
                </div>
              )}
              {adv.summary && (
                <div className="flex gap-2">
                  <span className="w-28 text-muted-foreground shrink-0">Summary</span>
                  <span className="text-xs leading-relaxed">{adv.summary}</span>
                </div>
              )}
            </div>
          </section>

          {/* Description */}
          {adv.description && adv.description !== adv.summary && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{adv.description}</p>
            </section>
          )}

          {/* Workaround */}
          {adv.workaround && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workaround</h3>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{adv.workaround}</p>
            </section>
          )}

          {/* Solution */}
          {adv.solution && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solution</h3>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{adv.solution}</p>
            </section>
          )}

          {/* Reference URL */}
          {adv.url && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference</h3>
              <a
                href={adv.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline break-all"
              >
                {adv.url}
              </a>
            </section>
          )}

          {/* Affected Products */}
          {adv.affectedProducts.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Affected Products ({adv.affectedProducts.length})
              </h3>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Vendor / Product</th>
                      <th className="px-3 py-2 text-left font-medium">Affected Versions</th>
                      <th className="px-3 py-2 text-left font-medium">Fixed</th>
                      <th className="px-3 py-2 text-left font-medium">Patch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adv.affectedProducts.map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{p.product}</div>
                          <div className="text-muted-foreground">{p.vendor}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {p.versionStart && p.versionEnd
                            ? `${p.versionStart} – ${p.versionEnd}`
                            : p.versionStart
                            ? `≥ ${p.versionStart}`
                            : p.versionEnd
                            ? `≤ ${p.versionEnd}`
                            : p.affectedVersions.length > 0
                            ? p.affectedVersions.join(", ")
                            : "n/a"}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {p.versionFixed ?? "n/a"}
                        </td>
                        <td className="px-3 py-2">
                          {p.patchAvailable === true
                            ? <Badge className="bg-green-600 text-white text-xs">Yes</Badge>
                            : p.patchAvailable === false
                            ? <Badge variant="outline" className="text-xs">No</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ))}
    </div>
  )
}
