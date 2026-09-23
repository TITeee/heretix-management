import { describe, it, expect } from "vitest"
import { validateCsvRows, type RawCsvRow } from "./csv-import"

function row(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    name: "FW-Tokyo-01",
    hostname: "fw-tokyo-01.example.com",
    asset_type: "host",
    vendor: "fortinet",
    product: "FortiOS",
    version: "7.4.3",
    tags: "",
    ...overrides,
  }
}

describe("validateCsvRows", () => {
  it("accepts a well-formed row", () => {
    const [result] = validateCsvRows([row()], new Set())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row).toEqual({
        name: "FW-Tokyo-01", hostname: "fw-tokyo-01.example.com", assetType: "host",
        vendor: "fortinet", product: "FortiOS", version: "7.4.3", tags: [],
      })
    }
  })

  it("defaults name to hostname when blank", () => {
    const [result] = validateCsvRows([row({ name: "" })], new Set())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.row.name).toBe("fw-tokyo-01.example.com")
  })

  it("defaults asset_type to host when blank, and accepts docker_image", () => {
    const [a] = validateCsvRows([row({ asset_type: "" })], new Set())
    expect(a.ok && a.row.assetType).toBe("host")
    const [b] = validateCsvRows([row({ asset_type: "docker_image" })], new Set())
    expect(b.ok && b.row.assetType).toBe("docker_image")
  })

  it("rejects a missing hostname", () => {
    const [result] = validateCsvRows([row({ hostname: "" })], new Set())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toEqual(["hostname is required"])
  })

  it("rejects an invalid asset_type", () => {
    const [result] = validateCsvRows([row({ asset_type: "router" })], new Set())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(/asset_type must be/)
  })

  it("resolves vendor case-insensitively and by label", () => {
    const [byKey] = validateCsvRows([row({ vendor: "FORTINET" })], new Set())
    expect(byKey.ok && byKey.row.vendor).toBe("fortinet")
    const [byLabel] = validateCsvRows([row({ vendor: "Palo Alto Networks", product: "PAN-OS" })], new Set())
    expect(byLabel.ok && byLabel.row.vendor).toBe("paloalto")
  })

  it("rejects an unknown vendor", () => {
    const [result] = validateCsvRows([row({ vendor: "acme-corp" })], new Set())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(/unknown vendor/)
  })

  it("resolves product case-insensitively", () => {
    const [result] = validateCsvRows([row({ product: "fortios" })], new Set())
    expect(result.ok).toBe(true)
    expect(result.ok && result.row.product).toBe("FortiOS")
  })

  // The whole point of validating product against the vendor's own catalog:
  // heretix-api matches by this exact string, so a typo that slips through
  // as free text would import successfully and then silently return zero
  // vulnerabilities on every future scan.
  it("rejects a product that isn't in the vendor's catalog", () => {
    const [result] = validateCsvRows([row({ product: "FortiGate" })], new Set())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(/not a known product/)
  })

  it("rejects a product that belongs to a different vendor", () => {
    const [result] = validateCsvRows([row({ vendor: "cisco", product: "FortiOS" })], new Set())
    expect(result.ok).toBe(false)
  })

  it("rejects a missing version", () => {
    const [result] = validateCsvRows([row({ version: "" })], new Set())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toContain("version is required")
  })

  it("splits tags on ';' and trims whitespace", () => {
    const known = new Set(["internet facing", "public endpoint"])
    const [result] = validateCsvRows([row({ tags: " Internet Facing ; Public Endpoint" })], known)
    expect(result.ok).toBe(true)
    expect(result.ok && result.row.tags).toEqual(["Internet Facing", "Public Endpoint"])
  })

  it("rejects a tag that doesn't exist as an asset tag", () => {
    const [result] = validateCsvRows([row({ tags: "Not A Real Tag" })], new Set(["internet facing"]))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(/unknown tag/)
  })

  it("flags an in-file duplicate (same hostname, product, and version) on the later row", () => {
    const results = validateCsvRows([row(), row()], new Set())
    expect(results[0].ok).toBe(true)
    expect(results[1].ok).toBe(false)
    expect(!results[1].ok && results[1].errors[0]).toMatch(/duplicate of line 1/)
  })

  it("does not flag the same hostname with a different product as a duplicate", () => {
    const results = validateCsvRows([row(), row({ product: "FortiSwitchManager" })], new Set())
    expect(results[0].ok).toBe(true)
    expect(results[1].ok).toBe(true)
  })

  it("numbers results by 1-indexed CSV data line, matching input order", () => {
    const results = validateCsvRows([row(), row({ hostname: "" }), row({ hostname: "fw-2" })], new Set())
    expect(results.map((r) => r.line)).toEqual([1, 2, 3])
  })
})
