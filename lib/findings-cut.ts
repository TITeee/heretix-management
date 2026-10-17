/**
 * Packages whose findings heretix-api cut short.
 *
 * A package that matches more findings than heretix-api sends (5,000 per
 * package; a Windows Server months behind on updates, an RHEL kernel) gets its
 * most severe ones (known exploited first, then by CVSS) and a flag saying so.
 * Only those become alerts, so the rest are not in the console at all. The
 * scan keeps what it was told (Package.findingsCut / findingsMatched /
 * findingsReturned) so the pages can say so instead of passing the alert count
 * off as complete.
 */

export type CutFindings = {
  findingsCut: boolean
  /** How many findings matched; null when heretix-api did not say (releases that cut at 500 without a flag). */
  findingsMatched: number | null
  findingsReturned: number | null
}

const fmt = (n: number) => n.toLocaleString("en-US")

/** "5,000 of 6,122" when the total is known, "at least 500" when it is not. */
export function cutLabel(p: Pick<CutFindings, "findingsMatched" | "findingsReturned">): string {
  if (p.findingsMatched != null && p.findingsReturned != null) {
    return `${fmt(p.findingsReturned)} of ${fmt(p.findingsMatched)}`
  }
  return p.findingsReturned != null ? `at least ${fmt(p.findingsReturned)}` : "cut"
}

/** The sentence for a tooltip or a dialog. */
export function cutExplanation(p: Pick<CutFindings, "findingsMatched" | "findingsReturned">): string {
  const missing = p.findingsMatched != null && p.findingsReturned != null ? p.findingsMatched - p.findingsReturned : null
  return (
    (missing != null
      ? `heretix-api matched ${fmt(p.findingsMatched!)} findings and returned the ${fmt(p.findingsReturned!)} most severe, so ${fmt(missing)} are not alerts. `
      : "heretix-api returned only part of this package's findings, so some are not alerts. ") +
    "The ones left out are the least severe: known exploited first, then by CVSS."
  )
}
