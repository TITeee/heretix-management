/**
 * Which of an advisory's Affected Products rows are the alert's own, for the "This alert"
 * badge on the Advisory tab.
 *
 * heretix-api writes the rows of a distro's advisories (Red Hat, Oracle Linux) with a vendor
 * named after the ecosystem and its release: "Red Hat:9" -> "red-hat-9", "Oracle Linux:9" ->
 * "oracle-linux-9" (rpmAdvisoryVendor in heretix-api's src/utils/search-helpers.ts), and the
 * product is the binary rpm's name. So the alert's own rows are found by the same mechanical
 * rule, with no table to keep in step: an ecosystem the rule does not cover (Microsoft's
 * "advisory", a vendor's own product advisories) matches nothing, and the row simply gets no
 * badge. A missed badge is the worst case; a wrong one cannot happen, since the product must
 * also be the alert's package.
 */
export type AdvisoryAlert = { ecosystem: string; packageName: string; sourcePackage?: string | null }

type AdvisoryProductRow = { vendor: string; product: string }

/** "Red Hat:9" -> "red-hat-9"; the bare legacy "oracle-linux" stays as it is. */
export function advisoryVendorOf(ecosystem: string): string {
  return ecosystem.trim().toLowerCase().replace(/[\s:]+/g, "-")
}

/** A module-stream package is stored as "name::stream" ("aopalliance::maven:3.9"), a source rpm as "name.src". */
function productName(product: string): string {
  return product.split("::")[0].replace(/\.src$/, "")
}

export function isOwnAdvisoryProduct(row: AdvisoryProductRow, alert: AdvisoryAlert | null | undefined): boolean {
  if (!alert || !alert.ecosystem || row.vendor !== advisoryVendorOf(alert.ecosystem)) return false
  const name = productName(row.product)
  return name === alert.packageName || (!!alert.sourcePackage && name === alert.sourcePackage)
}

export function isOwnAdvisory(advisory: { affectedProducts: AdvisoryProductRow[] }, alert: AdvisoryAlert | null | undefined): boolean {
  return advisory.affectedProducts.some((row) => isOwnAdvisoryProduct(row, alert))
}
