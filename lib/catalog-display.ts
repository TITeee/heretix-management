import type { CatalogListing } from "@/lib/heretix-api"

export const CATEGORY_LABELS: Record<string, string> = {
  network: "Network",
  middleware: "Middleware",
  database: "Database",
  devops: "DevOps",
  application: "Application",
}

export const CATALOG_SOURCE_LABELS: Record<string, string> = { nvd: "NVD", cna: "CNA" }

/**
 * The exact rows a search by this entry's name asks, one line each, so a user
 * sees what will be searched instead of trusting a name: "NVD  f5 / big-ip*
 * (not big-ip_next*)", "CNA  Nintex / Automation".
 */
export function describeCatalogPairs(entry: CatalogListing): string[] {
  const lines: string[] = []
  for (const p of entry.nvd) {
    const names = [...(p.products ?? []), ...(p.productPrefixes ?? []).map((x) => `${x}*`)]
    const except = p.excludePrefixes?.length ? ` (not ${p.excludePrefixes.map((x) => `${x}*`).join(", ")})` : ""
    lines.push(`NVD  ${p.vendor} / ${names.join(", ")}${except}`)
  }
  for (const p of entry.cna) {
    lines.push(`CNA  ${p.vendors.join(" | ")} / ${p.products.join(", ")}`)
  }
  return lines
}
