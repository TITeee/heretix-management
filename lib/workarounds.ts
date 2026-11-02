/**
 * The workarounds for the Overview's Workarounds section: the alert's own advisories', Red Hat
 * VEX's and the CNA's, each with where it came from. Only workarounds, not solutions: a
 * solution is mostly "upgrade to X", which for a distro package names the upstream version,
 * not the distro's fixed build. Solutions stay on the Advisory and CNA tabs.
 *
 * Every text is shown verbatim, "no known workarounds" and Red Hat's stock text included, since
 * saying there is none is worth seeing too. The same text from two sources (Red Hat writes both
 * its VEX and its CNA record) is shown once, with both sources.
 */
import { isOwnAdvisory, type AdvisoryAlert } from "./advisory-own"

type WorkaroundAdvisory = {
  source: string
  externalId: string
  workaround: string | null
  affectedProducts: { vendor: string; product: string }[]
}

export type WorkaroundDetail = {
  advisoryVulnerabilities: WorkaroundAdvisory[]
  cnaWorkaround?: string | null
  cnaProvider?: string | null
}

export type Workaround = { text: string; sources: string[] }

const RED_HAT_VEX = "red-hat-vex"

/**
 * Whether the advisory is about the alert's package or product:
 * - a distro package: one of its rows is the alert's own (lib/advisory-own.ts);
 * - a Red Hat VEX advisory with no rows (a CVE fixed everywhere that still has Red Hat's
 *   workaround): any Red Hat alert;
 * - a manually added product (ecosystem "advisory"): one of its rows names the product.
 */
function isAlertAdvisory(adv: WorkaroundAdvisory, alert: AdvisoryAlert): boolean {
  if (isOwnAdvisory(adv, alert)) return true
  if (adv.source === RED_HAT_VEX) return adv.affectedProducts.length === 0 && alert.ecosystem.startsWith("Red Hat:")
  if (alert.ecosystem !== "advisory") return false
  const product = alert.packageName.trim().toLowerCase()
  return adv.affectedProducts.some((row) => row.product.trim().toLowerCase() === product)
}

function sourceLabel(adv: WorkaroundAdvisory): string {
  return adv.source === RED_HAT_VEX ? "Red Hat VEX" : `${adv.source} ${adv.externalId}`
}

/** Vendor and distro advisories first, then Red Hat VEX, then the CNA. */
export function collectWorkarounds(detail: WorkaroundDetail | null, alert: AdvisoryAlert | null): Workaround[] {
  if (!detail || !alert) return []

  const found: { text: string; source: string }[] = []
  const advisories = detail.advisoryVulnerabilities.filter((adv) => adv.workaround?.trim() && isAlertAdvisory(adv, alert))
  for (const adv of [
    ...advisories.filter((adv) => adv.source !== RED_HAT_VEX),
    ...advisories.filter((adv) => adv.source === RED_HAT_VEX),
  ]) {
    found.push({ text: adv.workaround!.trim(), source: sourceLabel(adv) })
  }
  if (detail.cnaWorkaround?.trim()) {
    found.push({ text: detail.cnaWorkaround.trim(), source: `CNA: ${detail.cnaProvider ?? "unknown"}` })
  }

  const byText = new Map<string, Workaround>()
  for (const { text, source } of found) {
    const existing = byText.get(text)
    if (!existing) byText.set(text, { text, sources: [source] })
    else if (!existing.sources.includes(source)) existing.sources.push(source)
  }
  return [...byText.values()]
}
