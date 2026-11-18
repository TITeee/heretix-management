/**
 * The sources behind a vulnerability looked up by its id, for the badges of a search result.
 *
 * heretix-api's /vulnerabilities/:id returns the master row with the rows it was built from
 * and no `sources` list, which a package search result does carry ("nvd", "osv", "cna", or an
 * advisory's own source such as "advisory-nginx"). Without it the badge fell back to the
 * result's `source`, which is "nvd" for any CVE, so a CVE known only from a vendor advisory
 * showed no advisory badge.
 */
export type LookupRecord = {
  nvdVulnerability?: unknown
  osvVulnerabilities?: unknown[] | null
  advisoryVulnerabilities?: Array<{ source?: string | null }> | null
  cnaVulnerability?: unknown
}

export function lookupSources(data: LookupRecord): string[] {
  const sources: string[] = []
  if (data.nvdVulnerability) sources.push("nvd")
  if (data.osvVulnerabilities?.length) sources.push("osv")
  for (const advisory of data.advisoryVulnerabilities ?? []) {
    if (advisory.source && !sources.includes(advisory.source)) sources.push(advisory.source)
  }
  if (data.cnaVulnerability) sources.push("cna")
  return sources
}
