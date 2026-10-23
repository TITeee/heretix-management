import { describe, it, expect } from "vitest"
import { advisoryVendorOf, isOwnAdvisory, isOwnAdvisoryProduct } from "./advisory-own"

// The vendor and product spellings below are the ones heretix-api stores today
// (CVE-2024-6387: RHSA-2024:4312, ELSA-2024-4312, the Oracle CPU and Sophos rows).
const alert = { ecosystem: "Red Hat:9", packageName: "openssh-server", sourcePackage: "openssh" }

describe("advisoryVendorOf", () => {
  it("names the vendor after the ecosystem the way heretix-api's rpmAdvisoryVendor does", () => {
    expect(advisoryVendorOf("Red Hat:9")).toBe("red-hat-9")
    expect(advisoryVendorOf("Oracle Linux:9")).toBe("oracle-linux-9")
    expect(advisoryVendorOf("Red Hat:10")).toBe("red-hat-10")
    // The bare spelling heretix-cli sent before 2026-09-01.
    expect(advisoryVendorOf("oracle-linux")).toBe("oracle-linux")
  })
})

describe("isOwnAdvisoryProduct", () => {
  it("matches the alert's release and its package or source package", () => {
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "openssh-server" }, alert)).toBe(true)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "openssh" }, alert)).toBe(true)
  })

  it("does not match another release, another vendor or another package", () => {
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-10", product: "openssh-server" }, alert)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "oracle-linux-9", product: "openssh-server" }, alert)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "oracle", product: "openssh-server" }, alert)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "openssh-clients" }, alert)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "sophos", product: "OpenSSH" }, alert)).toBe(false)
  })

  it("matches a module-stream or source-rpm product by its name", () => {
    const maven = { ecosystem: "Red Hat:9", packageName: "aopalliance" }
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "aopalliance::maven:3.9" }, maven)).toBe(true)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "aopalliance.src::maven:3.9" }, maven)).toBe(true)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "aopalliance-javadoc::maven:3.9" }, maven)).toBe(false)
  })

  it("gives no badge for an ecosystem the rule does not cover, or without an alert", () => {
    const windows = { ecosystem: "advisory", packageName: "Windows Server 2022" }
    expect(isOwnAdvisoryProduct({ vendor: "microsoft", product: "Windows Server 2022" }, windows)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "openssh" }, null)).toBe(false)
    expect(isOwnAdvisoryProduct({ vendor: "red-hat-9", product: "openssh" }, { ecosystem: "", packageName: "openssh" })).toBe(false)
  })

  it("keeps the legacy bare Oracle Linux rows to the legacy bare ecosystem", () => {
    const legacy = { ecosystem: "oracle-linux", packageName: "openssh" }
    expect(isOwnAdvisoryProduct({ vendor: "oracle-linux", product: "openssh" }, legacy)).toBe(true)
    expect(isOwnAdvisoryProduct({ vendor: "oracle-linux-9", product: "openssh" }, legacy)).toBe(false)
  })
})

describe("isOwnAdvisory", () => {
  it("is true when any row is the alert's own", () => {
    const rows = [
      { vendor: "red-hat-10", product: "openssh" },
      { vendor: "red-hat-9", product: "openssh-server" },
    ]
    expect(isOwnAdvisory({ affectedProducts: rows }, alert)).toBe(true)
    expect(isOwnAdvisory({ affectedProducts: [rows[0]] }, alert)).toBe(false)
    expect(isOwnAdvisory({ affectedProducts: [] }, alert)).toBe(false)
  })
})
