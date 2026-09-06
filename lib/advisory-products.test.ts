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
