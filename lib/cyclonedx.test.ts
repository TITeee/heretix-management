import { describe, it, expect } from "vitest"
import { convertCycloneDXToInventory, type CycloneDXBom } from "./cyclonedx"

// Fixtures are trimmed from real scanner output (Trivy 0.74.0, Syft 1.51.0),
// keeping the structure the importer depends on: bom-ref vs purl, the
// intermediate lockfile/OS nodes, and each scanner's property names.

function pkg(inventory: ReturnType<typeof convertCycloneDXToInventory>, name: string) {
  const p = inventory.packages.find(p => p.name === name)
  if (!p) throw new Error(`package ${name} not found`)
  return p
}

describe("convertCycloneDXToInventory — Trivy", () => {
  // `trivy fs` on a pnpm project: root → lockfile node (no purl) → direct deps
  const trivyFs: CycloneDXBom = {
    metadata: {
      component: { "bom-ref": "root-uuid", type: "application", name: "/src/app" },
      tools: { components: [{ name: "trivy", version: "0.74.0" }] },
    },
    components: [
      { "bom-ref": "lock-uuid", type: "application", name: "pnpm-lock.yaml",
        properties: [{ name: "aquasecurity:trivy:Type", value: "pnpm" }] },
      { "bom-ref": "pkg:npm/%40auth/core@0.41.3", type: "library", name: "core", version: "0.41.3", purl: "pkg:npm/%40auth/core@0.41.3" },
      { "bom-ref": "pkg:npm/jose@6.0.0", type: "library", name: "jose", version: "6.0.0", purl: "pkg:npm/jose@6.0.0" },
      { "bom-ref": "pkg:npm/next@16.0.0", type: "library", name: "next", version: "16.0.0", purl: "pkg:npm/next@16.0.0" },
    ],
    dependencies: [
      { ref: "root-uuid", dependsOn: ["lock-uuid"] },
      { ref: "lock-uuid", dependsOn: ["pkg:npm/%40auth/core@0.41.3", "pkg:npm/next@16.0.0"] },
      { ref: "pkg:npm/%40auth/core@0.41.3", dependsOn: ["pkg:npm/jose@6.0.0"] },
    ],
  }

  it("walks through the lockfile node to find direct dependencies", () => {
    const inv = convertCycloneDXToInventory(trivyFs)
    expect(inv.packages).toHaveLength(3)
    expect(pkg(inv, "@auth/core")).toMatchObject({ direct: true, deps: ["pkg:npm/jose@6.0.0"] })
    expect(pkg(inv, "next").direct).toBe(true)
    expect(pkg(inv, "jose").direct).toBe(false)
    expect(inv.sbomTool).toBe("trivy 0.74.0")
  })

  it("leaves packages under a flat, edge-less node unclassified", () => {
    // Installed-package scans (node-pkg, python-pkg, ...) list everything under
    // one node with no dependency edges — no lockfile to say what was asked for.
    const inv = convertCycloneDXToInventory({
      ...trivyFs,
      dependencies: [
        { ref: "root-uuid", dependsOn: ["lock-uuid"] },
        { ref: "lock-uuid", dependsOn: ["pkg:npm/%40auth/core@0.41.3", "pkg:npm/jose@6.0.0", "pkg:npm/next@16.0.0"] },
      ],
    })
    expect(inv.packages.map(p => p.direct)).toEqual([null, null, null])
  })

  // `trivy image rockylinux:9`: root → operating-system node → OS packages
  const trivyRocky: CycloneDXBom = {
    metadata: {
      component: { "bom-ref": "pkg:oci/rockylinux@sha256:d7be", type: "container", name: "rockylinux:9" },
    },
    components: [
      { "bom-ref": "os-uuid", type: "operating-system", name: "rocky", version: "9.3" },
      {
        "bom-ref": "pkg:rpm/rocky/findutils@4.8.0-6.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
        type: "library", name: "findutils", version: "1:4.8.0-6.el9",
        purl: "pkg:rpm/rocky/findutils@4.8.0-6.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
        properties: [{ name: "aquasecurity:trivy:SrcName", value: "findutils" }],
      },
      {
        "bom-ref": "pkg:rpm/rocky/openssl-libs@3.0.7-24.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
        type: "library", name: "openssl-libs", version: "1:3.0.7-24.el9",
        purl: "pkg:rpm/rocky/openssl-libs@3.0.7-24.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
        properties: [{ name: "aquasecurity:trivy:SrcName", value: "openssl" }],
      },
    ],
    dependencies: [
      { ref: "pkg:oci/rockylinux@sha256:d7be", dependsOn: ["os-uuid"] },
      { ref: "os-uuid", dependsOn: ["pkg:rpm/rocky/findutils@4.8.0-6.el9?arch=x86_64&distro=rocky-9.3&epoch=1"] },
      {
        ref: "pkg:rpm/rocky/findutils@4.8.0-6.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
        dependsOn: ["pkg:rpm/rocky/openssl-libs@3.0.7-24.el9?arch=x86_64&distro=rocky-9.3&epoch=1"],
      },
    ],
  }

  it("maps the OS point release to the major-version ecosystem heretix-api matches on", () => {
    const inv = convertCycloneDXToInventory(trivyRocky)
    expect(inv.packages.map(p => p.ecosystem)).toEqual(["Rocky Linux:9", "Rocky Linux:9"])
    // epoch stays in the version, as heretix-cli reports it
    expect(pkg(inv, "findutils").version).toBe("1:4.8.0-6.el9")
    expect(pkg(inv, "findutils").deps).toEqual(["pkg:rpm/rocky/openssl-libs@1:3.0.7-24.el9"])
    expect(inv).toMatchObject({ hostname: "rockylinux:9", type: "docker_image", os: { id: "rocky", versionId: "9.3" } })
  })

  it("does not classify OS packages hanging off the operating-system node", () => {
    const inv = convertCycloneDXToInventory(trivyRocky)
    expect(inv.packages.map(p => p.direct)).toEqual([null, null])
  })

  it("reads the source package from Trivy's SrcName", () => {
    const inv = convertCycloneDXToInventory(trivyRocky)
    expect(pkg(inv, "openssl-libs").sourcePackage).toBe("openssl")
    expect(pkg(inv, "findutils").sourcePackage).toBe("findutils")
  })

  it("resolves Alpine packages, whose distro qualifier has no distro id", () => {
    const inv = convertCycloneDXToInventory({
      components: [{
        "bom-ref": "pkg:apk/alpine/musl@1.2.5-r1?arch=x86_64&distro=3.20.10", type: "library",
        name: "musl", version: "1.2.5-r1", purl: "pkg:apk/alpine/musl@1.2.5-r1?arch=x86_64&distro=3.20.10",
      }],
    })
    expect(pkg(inv, "musl").ecosystem).toBe("Alpine:v3.20")
  })
})

describe("convertCycloneDXToInventory — Syft", () => {
  it("truncates the os-release VERSION_ID and reads each cataloger's source-package property", () => {
    const inv = convertCycloneDXToInventory({
      metadata: { component: { "bom-ref": "093ac00b", type: "container", name: "app" } },
      components: [
        { "bom-ref": "os:alpine@3.24.1", type: "operating-system", name: "alpine", version: "3.24.1" },
        {
          "bom-ref": "pkg:apk/alpine/busybox-binsh@1.37.0-r20?arch=x86_64&distro=alpine-3.24.1&package-id=1e1a",
          type: "library", name: "busybox-binsh", version: "1.37.0-r20",
          purl: "pkg:apk/alpine/busybox-binsh@1.37.0-r20?arch=x86_64&distro=alpine-3.24.1&upstream=busybox",
          properties: [{ name: "syft:metadata:originPackage", value: "busybox" }],
        },
        {
          "bom-ref": "deb-1", type: "library", name: "libssl3", version: "3.0.15-1",
          purl: "pkg:deb/debian/libssl3@3.0.15-1?arch=amd64&distro=debian-12",
          properties: [{ name: "syft:metadata:source", value: "openssl" }],
        },
        {
          "bom-ref": "rpm-1", type: "library", name: "openssl-libs", version: "1:3.0.7-24.el9",
          purl: "pkg:rpm/rocky/openssl-libs@3.0.7-24.el9?arch=x86_64&distro=rocky-9.3&epoch=1",
          properties: [{ name: "syft:metadata:sourceRpm", value: "openssl-3.0.7-24.el9.src.rpm" }],
        },
      ],
    })
    expect(pkg(inv, "busybox-binsh")).toMatchObject({ ecosystem: "Alpine:v3.24", sourcePackage: "busybox", direct: null })
    expect(pkg(inv, "libssl3")).toMatchObject({ ecosystem: "Debian:12", sourcePackage: "openssl" })
    expect(pkg(inv, "openssl-libs")).toMatchObject({ ecosystem: "Rocky Linux:9", sourcePackage: "openssl" })
  })

  it("drops RPM gpg-pubkey entries, which are imported signing keys rather than packages", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "k1", type: "library", name: "gpg-pubkey", version: "b86b3716-61e69f29", purl: "pkg:rpm/almalinux/gpg-pubkey@b86b3716-61e69f29?distro=almalinux-9.8" },
        { "bom-ref": "k2", type: "library", name: "gpg-pubkey", version: "b86b3716-61e69f29", purl: "pkg:rpm/alma/gpg-pubkey@b86b3716-61e69f29?arch=None&distro=alma-9.8" },
        { "bom-ref": "p1", type: "library", name: "bash", version: "5.1.8-9.el9", purl: "pkg:rpm/almalinux/bash@5.1.8-9.el9?arch=x86_64&distro=almalinux-9.8" },
      ],
    })
    expect(inv.packages.map(p => p.name)).toEqual(["bash"])
  })

  it("falls back to the operating-system component when a purl has no distro qualifier", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "os", type: "operating-system", name: "debian", version: "12" },
        { "bom-ref": "deb-1", type: "library", name: "bash", version: "5.2.15-2+b7", purl: "pkg:deb/debian/bash@5.2.15-2%2Bb7?arch=amd64" },
      ],
    })
    expect(pkg(inv, "bash").ecosystem).toBe("Debian:12")
  })
})

describe("convertCycloneDXToInventory — language packages the OS installed", () => {
  // Paths as Syft 1.52.0 records them on UBI 9 language images (ubi9, nodejs-20,
  // ruby-33, openjdk-21, go-toolset) and Debian bookworm.
  const lang = (name: string, version: string, purl: string, path: string) => ({
    "bom-ref": purl, type: "library", name, version, purl,
    properties: [{ name: "syft:location:0:path", value: path }],
  })
  const osManagedComponents = [
    { "bom-ref": "rpm-1", type: "library", name: "python3-urllib3", version: "1.26.5-8.el9_8", purl: "pkg:rpm/redhat/python3-urllib3@1.26.5-8.el9_8?arch=noarch&distro=rhel-9.8" },
    lang("urllib3", "1.26.5", "pkg:pypi/urllib3@1.26.5", "/usr/lib/python3.9/site-packages/urllib3-1.26.5-py3.9.egg-info/PKG-INFO"),
    lang("gpg", "1.15.1", "pkg:pypi/gpg@1.15.1", "/usr/lib64/python3.9/site-packages/gpg-1.15.1-py3.9.egg-info"),
    lang("tar", "6.2.1", "pkg:npm/tar@6.2.1", "/usr/lib/node_modules/npm/node_modules/tar/package.json"),
    lang("net-imap", "0.4.25", "pkg:gem/net-imap@0.4.25", "/usr/share/gems/specifications/net-imap-0.4.25.gemspec"),
    lang("guava", "33.3.0-jre", "pkg:maven/com.google.guava/guava@33.3.0-jre", "/usr/share/java/guava/guava.jar"),
    lang("jansi", "2.4.1", "pkg:maven/org.fusesource.jansi/jansi@2.4.1", "/usr/lib/java/jansi/jansi.jar"),
  ]

  it("excludes language packages under the distro's own install paths, keeping them in the inventory", () => {
    const inv = convertCycloneDXToInventory({
      components: [{ "bom-ref": "os", type: "operating-system", name: "rhel", version: "9.8" }, ...osManagedComponents],
    })
    for (const name of ["urllib3", "gpg", "tar", "net-imap", "com.google.guava:guava", "org.fusesource.jansi:jansi"]) {
      expect(pkg(inv, name)).toMatchObject({ scope: "excluded", category: "os-managed" })
    }
    // The rpm that actually installed urllib3 is still what gets scanned.
    expect(pkg(inv, "python3-urllib3")).toMatchObject({ scope: null, category: null })
  })

  it("covers Debian's dist-packages", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "os", type: "operating-system", name: "debian", version: "12" },
        lang("mercurial", "6.3.2", "pkg:pypi/mercurial@6.3.2", "/usr/lib/python3/dist-packages/mercurial-6.3.2.egg-info"),
      ],
    })
    expect(pkg(inv, "mercurial")).toMatchObject({ scope: "excluded", category: "os-managed" })
  })

  it("keeps packages installed by pip/npm/gem themselves, which go to /usr/local", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "os", type: "operating-system", name: "rhel", version: "9.8" },
        lang("requests", "2.31.0", "pkg:pypi/requests@2.31.0", "/usr/local/lib/python3.9/site-packages/requests-2.31.0.dist-info/METADATA"),
        lang("pm2", "5.4.0", "pkg:npm/pm2@5.4.0", "/usr/local/lib/node_modules/pm2/package.json"),
        lang("rails", "7.2.0", "pkg:gem/rails@7.2.0", "/usr/local/share/gems/specifications/rails-7.2.0.gemspec"),
        lang("next", "16.0.0", "pkg:npm/next@16.0.0", "/app/node_modules/next/package.json"),
      ],
    })
    for (const name of ["requests", "pm2", "rails", "next"]) {
      expect(pkg(inv, name)).toMatchObject({ scope: null, category: null })
    }
  })

  it("leaves Go binaries alone, since /usr/bin also holds an image's own binaries", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "os", type: "operating-system", name: "rhel", version: "9.8" },
        lang("stdlib", "go1.26.1", "pkg:golang/stdlib@go1.26.1", "/usr/bin/dlv"),
      ],
    })
    expect(pkg(inv, "stdlib")).toMatchObject({ scope: null, category: null })
  })

  it("does nothing on Alpine, where pip and npm install into /usr/lib too", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        { "bom-ref": "os", type: "operating-system", name: "alpine", version: "3.20.3" },
        lang("urllib3", "1.26.5", "pkg:pypi/urllib3@1.26.5", "/usr/lib/python3.12/site-packages/urllib3-1.26.5.dist-info/METADATA"),
      ],
    })
    expect(pkg(inv, "urllib3")).toMatchObject({ scope: null, category: null })
  })
})

describe("convertCycloneDXToInventory — licenses", () => {
  it("keeps each licenses[] entry as written, whichever field it is in", () => {
    const inv = convertCycloneDXToInventory({
      components: [
        // heretix-cli: SPDX id, SPDX expression, and rpm free text in license.name
        { type: "library", name: "lodash", version: "4.17.21", purl: "pkg:npm/lodash@4.17.21", licenses: [{ license: { id: "MIT" } }] },
        { type: "library", name: "cryptography", version: "42.0.0", purl: "pkg:pypi/cryptography@42.0.0", licenses: [{ expression: "Apache-2.0 OR BSD-3-Clause" }] },
        { type: "library", name: "bash", version: "5.1.8-9.el9", purl: "pkg:rpm/rocky/bash@5.1.8-9.el9?distro=rocky-9", licenses: [{ license: { name: "GPLv3+" } }] },
        // Several entries stay separate; duplicates and blanks are dropped.
        { type: "library", name: "multi", version: "1.0.0", purl: "pkg:npm/multi@1.0.0", licenses: [{ license: { id: "MIT" } }, { license: { name: " ISC " } }, { license: { id: "MIT" } }, { license: {} }] },
        { type: "library", name: "none", version: "1.0.0", purl: "pkg:npm/none@1.0.0" },
      ],
    })
    expect(pkg(inv, "lodash").licenses).toEqual(["MIT"])
    expect(pkg(inv, "cryptography").licenses).toEqual(["Apache-2.0 OR BSD-3-Clause"])
    expect(pkg(inv, "bash").licenses).toEqual(["GPLv3+"])
    expect(pkg(inv, "multi").licenses).toEqual(["MIT", "ISC"])
    expect(pkg(inv, "none").licenses).toEqual([])
  })
})
