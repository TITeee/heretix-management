import { describe, it, expect } from "vitest"
import {
  getProductsByVendor,
  ADVISORY_VENDORS,
  FORTINET_PRODUCTS,
  PALOALTO_PRODUCTS,
  SOPHOS_PRODUCTS,
  SPLUNK_PRODUCTS,
  CISCO_PRODUCTS,
  SONICWALL_PRODUCTS,
  BROADCOM_PRODUCTS,
  CHECKPOINT_PRODUCTS,
  IVANTI_PRODUCTS,
  CITRIX_PRODUCTS,
  APACHE_PRODUCTS,
  NGINX_PRODUCTS,
  TOMCAT_PRODUCTS,
  ZABBIX_PRODUCTS,
  ORACLE_CPU_PRODUCTS,
} from "./advisory-products"

describe("getProductsByVendor", () => {
  it.each([
    ["fortinet", FORTINET_PRODUCTS],
    ["paloalto", PALOALTO_PRODUCTS],
    ["sophos", SOPHOS_PRODUCTS],
    ["oracle", ORACLE_CPU_PRODUCTS],
    ["splunk", SPLUNK_PRODUCTS],
    ["cisco", CISCO_PRODUCTS],
    ["sonicwall", SONICWALL_PRODUCTS],
    ["broadcom", BROADCOM_PRODUCTS],
    ["checkpoint", CHECKPOINT_PRODUCTS],
    ["ivanti", IVANTI_PRODUCTS],
    ["citrix", CITRIX_PRODUCTS],
    ["apache", APACHE_PRODUCTS],
    ["nginx", NGINX_PRODUCTS],
    ["tomcat", TOMCAT_PRODUCTS],
    ["zabbix", ZABBIX_PRODUCTS],
  ] as const)("returns the %s product list", (vendor, expected) => {
    expect(getProductsByVendor(vendor)).toBe(expected)
  })

  it("every vendor listed in ADVISORY_VENDORS dispatches to its own product list, not Fortinet's by accidental fallthrough", () => {
    for (const { value } of ADVISORY_VENDORS) {
      if (value === "fortinet") continue
      expect(getProductsByVendor(value)).not.toBe(FORTINET_PRODUCTS)
    }
  })
})

describe("Ivanti", () => {
  it("is offered as a vendor, labelled Ivanti", () => {
    expect(ADVISORY_VENDORS).toContainEqual({ value: "ivanti", label: "Ivanti" })
  })

  it("lists the products as heretix-api stores them: without the vendor prefix, each once", () => {
    // heretix-api matches the product by exact string and stores "Connect Secure",
    // not "Ivanti Connect Secure"; a prefixed name here would find nothing.
    for (const name of IVANTI_PRODUCTS) expect(name).not.toMatch(/^Ivanti\b/)
    expect(new Set(IVANTI_PRODUCTS).size).toBe(IVANTI_PRODUCTS.length)
  })

  it("offers the products Ivanti's own advisories are most about, Connect Secure first (the default pick)", () => {
    expect(IVANTI_PRODUCTS[0]).toBe("Connect Secure")
    for (const name of ["Policy Secure", "Endpoint Manager Mobile", "Endpoint Manager", "Sentry"]) {
      expect(IVANTI_PRODUCTS).toContain(name)
    }
  })

  it("keeps the Pulse names out: heretix-api aliases them to Connect Secure and Policy Secure", () => {
    expect(IVANTI_PRODUCTS.some((p) => /^Pulse\b/.test(p))).toBe(false)
  })
})

describe("NetScaler", () => {
  it("is offered as a vendor, labelled NetScaler", () => {
    expect(ADVISORY_VENDORS).toContainEqual({ value: "citrix", label: "NetScaler" })
  })

  it("lists the products as heretix-api stores them, each once, NetScaler ADC first (the default pick)", () => {
    expect(CITRIX_PRODUCTS[0]).toBe("NetScaler ADC")
    expect(new Set(CITRIX_PRODUCTS).size).toBe(CITRIX_PRODUCTS.length)
    for (const name of CITRIX_PRODUCTS) expect(name).toMatch(/^NetScaler /)
  })

  it("keeps the FIPS / NDcPP builds a product of their own, and the old Citrix names out", () => {
    expect(CITRIX_PRODUCTS).toContain("NetScaler ADC FIPS and NDcPP")
    expect(CITRIX_PRODUCTS.some((p) => /^Citrix/.test(p))).toBe(false)
  })
})
