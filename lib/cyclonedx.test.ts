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
    expect(pkg(inv, "findutils").deps).toEqual(["pkg:generic/openssl-libs@1:3.0.7-24.el9"])
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
