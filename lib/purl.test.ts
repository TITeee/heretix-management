import { describe, it, expect } from "vitest"
import { buildPURL, distroQualifierToEcosystem, parsePURL } from "./purl"

describe("buildPURL", () => {
  it("builds an npm PURL for an unscoped package", () => {
    expect(buildPURL("lodash", "4.17.21", "npm")).toBe("pkg:npm/lodash@4.17.21")
  })

  it("percent-encodes the '@' in a scoped npm package name", () => {
    expect(buildPURL("@babel/core", "7.0.0", "npm")).toBe("pkg:npm/%40babel/core@7.0.0")
  })

  it("builds a PyPI PURL", () => {
    expect(buildPURL("requests", "2.31.0", "PyPI")).toBe("pkg:pypi/requests@2.31.0")
  })

  it("builds a Go PURL", () => {
    expect(buildPURL("github.com/pkg/errors", "0.9.1", "Go")).toBe("pkg:golang/github.com/pkg/errors@0.9.1")
  })

  it("builds a Maven PURL", () => {
    expect(buildPURL("org.apache.commons:commons-lang3", "3.12.0", "Maven")).toBe(
      "pkg:maven/org.apache.commons:commons-lang3@3.12.0",
    )
  })

  it("builds a NuGet PURL", () => {
    expect(buildPURL("Newtonsoft.Json", "13.0.3", "NuGet")).toBe("pkg:nuget/Newtonsoft.Json@13.0.3")
  })

  it("builds a RubyGems PURL", () => {
    expect(buildPURL("rails", "7.1.0", "RubyGems")).toBe("pkg:gem/rails@7.1.0")
  })

  it("builds a Packagist PURL", () => {
    expect(buildPURL("symfony/console", "6.4.0", "Packagist")).toBe("pkg:composer/symfony/console@6.4.0")
  })

  it.each([
    ["Ubuntu:22.04", "pkg:deb/ubuntu"],
    ["Debian:12", "pkg:deb/debian"],
    ["AlmaLinux:9", "pkg:rpm/almalinux"],
    ["Rocky:9", "pkg:rpm/rocky"],
    ["Alpine:v3.19", "pkg:apk/alpine"],
    ["Red Hat:9", "pkg:rpm/rhel"],
    ["CentOS:7", "pkg:rpm/centos"],
  ] as const)("builds an OS-package PURL for %s ecosystem prefix", (ecosystem, expectedPrefix) => {
    expect(buildPURL("openssl", "3.0.2", ecosystem)).toBe(`${expectedPrefix}/openssl@3.0.2`)
  })

  it("builds an oracle-linux PURL from the bare ecosystem string", () => {
    expect(buildPURL("glibc", "2.34", "oracle-linux")).toBe("pkg:rpm/oraclelinux/glibc@2.34")
  })

  it("falls back to a generic PURL for an unrecognized ecosystem", () => {
    expect(buildPURL("mystery-pkg", "1.0.0", "Cargo")).toBe("pkg:generic/mystery-pkg@1.0.0")
  })
})

describe("distroQualifierToEcosystem", () => {
  it.each([
    // heretix-cli qualifiers — these already map this way and must not change,
    // since ecosystem is part of Package and Alert identity.
    ["almalinux-9", "AlmaLinux:9"],
    ["rockylinux-9", "Rocky Linux:9"],
    ["rocky-8", "Rocky Linux:8"],
    ["oraclelinux-9", "Oracle Linux:9"],
    ["oracle-linux", "oracle-linux"],
    ["rhel-9", "Red Hat:9"],
    ["centos-7", "CentOS:7"],
    ["debian-12", "Debian:12"],
    ["ubuntu-22.04", "Ubuntu:22.04:LTS"],
    ["alpine-3.18", "Alpine:v3.18"],
    // Trivy and Syft pass the OS point release through
    ["rocky-9.3", "Rocky Linux:9"],
    ["debian-12.15", "Debian:12"],
    ["alpine-3.24.1", "Alpine:v3.24"],
    ["ol-9.4", "Oracle Linux:9"],
    ["almalinux-9.4", "AlmaLinux:9"],
    // Trivy OS family names
    ["redhat-9.3", "Red Hat:9"],
    ["alma-9.4", "AlmaLinux:9"],
    ["oracle-8.10", "Oracle Linux:8"],
    // OSV suffixes only LTS releases
    ["ubuntu-24.10", "Ubuntu:24.10"],
    ["ubuntu-24.04", "Ubuntu:24.04:LTS"],
    ["amzn-2", ""],
  ] as const)("maps %s to %s", (distro, expected) => {
    expect(distroQualifierToEcosystem(distro)).toBe(expected)
  })

  it("takes the distro id from the namespace when the qualifier is only a version (Trivy on Alpine)", () => {
    expect(distroQualifierToEcosystem("3.20.10", "alpine")).toBe("Alpine:v3.20")
    expect(distroQualifierToEcosystem("3.20.10")).toBe("")
  })
})

describe("parsePURL", () => {
  it("resolves a Trivy Alpine package, whose distro qualifier carries no distro id", () => {
    expect(parsePURL("pkg:apk/alpine/musl@1.2.5-r1?arch=x86_64&distro=3.20.10")).toMatchObject({
      type: "apk", namespace: "alpine", name: "musl", version: "1.2.5-r1", ecosystem: "Alpine:v3.20",
    })
  })

  it("percent-decodes the version", () => {
    expect(parsePURL("pkg:deb/debian/bsdutils@2.38.1-5%2Bdeb12u3?distro=debian-12.15&epoch=1")).toMatchObject({
      name: "bsdutils", version: "2.38.1-5+deb12u3", ecosystem: "Debian:12",
    })
  })

  it("uses the fallback distro only when the qualifier is missing", () => {
    expect(parsePURL("pkg:rpm/rocky/bash@5.1.8-6.el9", "rocky-9.3")?.ecosystem).toBe("Rocky Linux:9")
    expect(parsePURL("pkg:rpm/rocky/bash@5.1.8-6.el9?distro=rocky-8.9", "rocky-9.3")?.ecosystem).toBe("Rocky Linux:8")
    expect(parsePURL("pkg:rpm/rocky/bash@5.1.8-6.el9")?.ecosystem).toBe("")
  })

  it("keeps the namespace in a language package name and maps the ecosystem", () => {
    expect(parsePURL("pkg:npm/%40babel/core@7.20.0")).toMatchObject({ name: "@babel/core", ecosystem: "npm" })
    expect(parsePURL("pkg:golang/github.com/x/net@0.1.0")).toMatchObject({ name: "github.com/x/net", ecosystem: "Go" })
  })

  it("accepts a PURL without a version", () => {
    expect(parsePURL("pkg:npm/lodash")).toMatchObject({ name: "lodash", version: null })
  })

  it("returns null for something that is not a PURL", () => {
    expect(parsePURL("cpe:2.3:a:vendor:product:1.0")).toBeNull()
  })
})
