import { describe, it, expect } from "vitest"
import { buildPURL } from "./purl"

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
