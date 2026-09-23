import { ADVISORY_VENDORS, getProductsByVendor, type AdvisoryVendor } from "@/lib/advisory-products"

// One CSV row = one asset + one appliance package. Multiple rows sharing the
// same hostname add multiple packages to the same asset (e.g. a firewall
// whose SSL-VPN component is tracked as a second Advisory product).
export const CSV_COLUMNS = ["name", "hostname", "asset_type", "vendor", "product", "version", "tags"] as const

export type RawCsvRow = Record<string, string>

export type CsvImportRow = {
  name: string
  hostname: string
  assetType: "host" | "docker_image"
  vendor: AdvisoryVendor
  product: string
  version: string
  tags: string[]
}

export type CsvRowResult =
  | { line: number; ok: true; row: CsvImportRow }
  | { line: number; ok: false; hostname: string; errors: string[] }

const VENDOR_BY_LOOKUP = new Map<string, AdvisoryVendor>()
for (const v of ADVISORY_VENDORS) {
  VENDOR_BY_LOOKUP.set(v.value.toLowerCase(), v.value)
  VENDOR_BY_LOOKUP.set(v.label.toLowerCase(), v.value)
}

function resolveVendor(raw: string): AdvisoryVendor | undefined {
  return VENDOR_BY_LOOKUP.get(raw.trim().toLowerCase())
}

function resolveProduct(vendor: AdvisoryVendor, raw: string): string | undefined {
  const products = getProductsByVendor(vendor)
  const needle = raw.trim().toLowerCase()
  return products.find((p) => p.toLowerCase() === needle)
}

// Validates one CSV row in isolation (no DB access — cross-row and DB-backed
// checks, like duplicate hostnames or unknown tags, happen in importCsvRows
// once every row's own shape is known to be valid).
function validateRow(raw: RawCsvRow, line: number): CsvRowResult {
  const errors: string[] = []
  const hostname = (raw.hostname ?? "").trim()
  const name = (raw.name ?? "").trim() || hostname
  const rawAssetType = (raw.asset_type ?? "").trim().toLowerCase()
  const rawVendor = (raw.vendor ?? "").trim()
  const rawProduct = (raw.product ?? "").trim()
  const version = (raw.version ?? "").trim()
  const rawTags = (raw.tags ?? "").trim()

  if (!hostname) errors.push("hostname is required")

  let assetType: "host" | "docker_image" = "host"
  if (rawAssetType && rawAssetType !== "host" && rawAssetType !== "docker_image") {
    errors.push(`asset_type must be "host" or "docker_image" (got "${raw.asset_type}")`)
  } else if (rawAssetType === "docker_image") {
    assetType = "docker_image"
  }

  let vendor: AdvisoryVendor | undefined
  if (!rawVendor) {
    errors.push("vendor is required")
  } else {
    vendor = resolveVendor(rawVendor)
    if (!vendor) {
      const known = ADVISORY_VENDORS.map((v) => v.value).join(", ")
      errors.push(`unknown vendor "${rawVendor}" (expected one of: ${known})`)
    }
  }

  let product: string | undefined
  if (!rawProduct) {
    errors.push("product is required")
  } else if (vendor) {
    product = resolveProduct(vendor, rawProduct)
    if (!product) {
      errors.push(`"${rawProduct}" is not a known product for vendor "${vendor}"`)
    }
  }

  if (!version) errors.push("version is required")

  const tags = rawTags ? rawTags.split(";").map((t) => t.trim()).filter(Boolean) : []

  if (errors.length > 0) {
    return { line, ok: false, hostname, errors }
  }

  return {
    line,
    ok: true,
    row: { name, hostname, assetType, vendor: vendor!, product: product!, version, tags },
  }
}

/**
 * Validates every row (per-row shape, in-file duplicate packages, and tag
 * names against the asset tags that actually exist) and returns one result
 * per row, in the original order, keyed by its 1-indexed CSV data line.
 *
 * DB-agnostic beyond `existingAssetTagNames` — call sites decide whether the
 * per-row results are used for a read-only preview or to actually import
 * (see importCsvRows in the API route), so this function never touches the
 * database itself.
 */
export function validateCsvRows(rawRows: RawCsvRow[], existingAssetTagNames: Set<string>): CsvRowResult[] {
  const shapeChecked = rawRows.map((raw, i) => validateRow(raw, i + 1))

  // Unknown tags: checked here rather than in validateRow so the "known
  // tags" list only has to be looked up once for the whole file.
  const tagsChecked = shapeChecked.map((result): CsvRowResult => {
    if (!result.ok) return result
    const unknown = result.row.tags.filter((t) => !existingAssetTagNames.has(t.toLowerCase()))
    if (unknown.length === 0) return result
    return { line: result.line, ok: false, hostname: result.row.hostname, errors: [`unknown tag(s): ${unknown.join(", ")}`] }
  })

  // In-file duplicates: the same asset (hostname) listing the same package
  // (product+version) twice. Cheaper to flag than to silently create it once
  // and skip the second occurrence, since that's much more likely to be a
  // copy-paste mistake the uploader should see and fix than intentional.
  const seen = new Map<string, number>() // "hostname::product::version" -> first line
  return tagsChecked.map((result): CsvRowResult => {
    if (!result.ok) return result
    const key = `${result.row.hostname}::${result.row.product}::${result.row.version}`
    const firstLine = seen.get(key)
    if (firstLine !== undefined) {
      return { line: result.line, ok: false, hostname: result.row.hostname, errors: [`duplicate of line ${firstLine}: same hostname, product, and version`] }
    }
    seen.set(key, result.line)
    return result
  })
}
