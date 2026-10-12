/**
 * The modules (components) a CVE record says a product is affected in.
 *
 * Some vendors scope a CVE to part of a product: F5 writes `modules: ["ASM"]` for a BIG-IP
 * flaw that needs the ASM module, or `"All Modules"` for one that does not. The version alone
 * cannot say whether a device has that module, so the alert shows it for the person to check
 * against what the device runs. It is read from the CNA's own declaration (`rawAffected`),
 * which heretix-api returns with the vulnerability detail.
 *
 * Only for the CNAs listed in MODULE_CNAS. The CVE format's `modules` is free text and CNAs use
 * it for different things: F5 names the product modules a device may or may not run (ASM, APM,
 * "All Modules", NGINX's ngx_http_rewrite_module), but VulDB writes the feature or endpoint
 * ("TinyMCE Media Upload"), EEF the Elixir module, PostgreSQL's pgAdmin records the area of the
 * code ("Backup"), CIRCL a file path. Shown as modules to check against a device, those would
 * mislead, and they are 5,000 of the CVEs that have the field. A CNA is added here once its
 * `modules` have been read and found to mean what F5's do.
 */
const MODULE_CNAS = new Set(["f5"])

export type CnaProductModules = {
  product: string
  modules: string[]
  /** The record says every module is affected ("All Modules", "ALL"): nothing to narrow it down. */
  all: boolean
}

const ALL_MODULES = /^all[\s_-]*(modules?)?$/i

/**
 * Per product, the modules the record names. Products that name none are left out, and so is
 * every record whose CNA is not in MODULE_CNAS. The same product listed in several entries is
 * merged; duplicates are dropped.
 */
export function cnaModules(rawAffected: unknown, cnaShortName: string | null | undefined): CnaProductModules[] {
  if (!cnaShortName || !MODULE_CNAS.has(cnaShortName.trim().toLowerCase())) return []
  if (!Array.isArray(rawAffected)) return []

  const byProduct = new Map<string, CnaProductModules>()
  for (const entry of rawAffected) {
    if (typeof entry !== "object" || entry === null) continue
    const { product, modules } = entry as { product?: unknown; modules?: unknown }
    if (typeof product !== "string" || product.trim() === "" || !Array.isArray(modules)) continue

    const names = modules
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim())
      .filter((m) => m !== "")
    if (names.length === 0) continue

    const item = byProduct.get(product) ?? { product, modules: [], all: false }
    for (const name of names) {
      if (ALL_MODULES.test(name)) item.all = true
      else if (!item.modules.includes(name)) item.modules.push(name)
    }
    byProduct.set(product, item)
  }
  return [...byProduct.values()]
}
