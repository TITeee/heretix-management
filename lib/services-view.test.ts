import { describe, it, expect } from "vitest"
import { buildServicesView, isService, type ServicesAlertInput, type ServicesPackageInput } from "./services-view"

function pkg(name: string, over: Partial<ServicesPackageInput> = {}): ServicesPackageInput {
  return {
    name, version: "1.0", ecosystem: "Red Hat:9", sourcePackage: null,
    inUse: true, usedBy: [], needsRestart: false, restartNeededBy: [], ...over,
  }
}

function alert(packageName: string, externalId: string, over: Partial<ServicesAlertInput> = {}): ServicesAlertInput {
  return { packageName, packageVersion: "1.0", externalId, severity: "MEDIUM", cvssScore: 5, isKev: false, fixedVersion: null, ...over }
}

// Six services; glibc and openssl are loaded by most of them, as on a real host.
const ALL = ["sshd.service", "polkit.service", "NetworkManager.service", "tuned.service", "crond.service", "bash"]

describe("buildServicesView", () => {
  const packages = [
    pkg("glibc", { usedBy: ALL }),
    pkg("openssl-libs", { sourcePackage: "openssl", usedBy: ALL.slice(0, 4) }),
    pkg("openssh-server", { sourcePackage: "openssh", usedBy: ["sshd.service"] }),
    pkg("libcurl", { sourcePackage: "curl", usedBy: ["NetworkManager.service"] }),
    pkg("curl", { usedBy: ["NetworkManager.service"] }),
    pkg("polkit-libs", { sourcePackage: "polkit", usedBy: ["polkit.service"] }),
    // The running kernel: in use, no process maps it.
    pkg("kernel-core", { sourcePackage: "kernel", usedBy: [] }),
    pkg("kernel-modules-core", { sourcePackage: "kernel", usedBy: [] }),
    // Installed, not loaded; and a package /proc could not judge.
    pkg("expat", { inUse: false }),
    pkg("tzdata", { inUse: null }),
    // In use, but no open findings: not part of the view.
    pkg("zlib", { usedBy: ALL }),
  ]
  const alerts = [
    alert("glibc", "CVE-1", { severity: "HIGH", cvssScore: 7.5 }),
    alert("openssl-libs", "CVE-2"),
    alert("openssh-server", "CVE-3", { severity: "CRITICAL", cvssScore: 9.8, fixedVersion: "9.9" }),
    // One vulnerability on two packages of one source package counts once.
    alert("libcurl", "CVE-4", { isKev: true, severity: "HIGH", cvssScore: 8.1 }),
    alert("curl", "CVE-4", { isKev: true, severity: "HIGH", cvssScore: 8.1 }),
    alert("polkit-libs", "CVE-5", { severity: "LOW", cvssScore: 2 }),
    alert("kernel-core", "CVE-6"),
    alert("kernel-modules-core", "CVE-6"),
    alert("kernel-core", "CVE-7", { severity: "HIGH", cvssScore: 7 }),
    alert("expat", "CVE-8"),
    alert("tzdata", "CVE-9"),
  ]
  const view = buildServicesView(packages, alerts)

  it("counts the services and how the vulnerable packages stand", () => {
    expect(view.services).toBe(6)
    expect(view.vulnerableInUse).toBe(8)
    expect(view.vulnerableNotLoaded).toBe(1)
    expect(view.vulnerableUndetermined).toBe(1)
  })

  it("puts the running kernel apart, its subpackages as one group counted by vulnerability", () => {
    expect(view.kernel).toHaveLength(1)
    expect(view.kernel[0]).toMatchObject({ key: "kernel", vulns: 2, worst: "high" })
    expect(view.kernel[0].packages.map((p) => p.name)).toEqual(["kernel-core", "kernel-modules-core"])
  })

  it("shows the libraries at least half of the services load once, not on every row", () => {
    expect(view.common.map((g) => [g.key, g.loadedBy])).toEqual([["glibc", 6], ["openssl", 4]])
    for (const row of view.rows) {
      expect(row.groups.map((g) => g.key)).not.toContain("glibc")
      expect(row.groups.map((g) => g.key)).not.toContain("openssl")
    }
    expect(view.rows.find((r) => r.name === "sshd.service")?.commonLoaded).toBe(2)
    expect(view.rows.find((r) => r.name === "bash")?.commonLoaded).toBe(1)
  })

  it("lists each service's own vulnerable packages, KEV first, with units and processes told apart", () => {
    expect(view.rows.map((r) => r.name).slice(0, 3)).toEqual(["NetworkManager.service", "sshd.service", "polkit.service"])
    const nm = view.rows[0]
    expect(nm).toMatchObject({ kind: "unit", vulns: 1, kev: 1, worst: "high" })
    expect(nm.groups[0].packages.map((p) => p.name)).toEqual(["curl", "libcurl"])
    expect(view.rows.find((r) => r.name === "sshd.service")).toMatchObject({ vulns: 1, fixable: 1, worst: "critical" })
    expect(view.rows.find((r) => r.name === "bash")).toMatchObject({ kind: "process", vulns: 0, groups: [] })
  })

  it("counts a systemd unit as a service, but not a scope or a command outside a unit", () => {
    expect(isService({ name: "sshd.service", kind: "unit" })).toBe(true)
    expect(isService({ name: "sshd.socket", kind: "unit" })).toBe(true)
    expect(isService({ name: "session-3.scope", kind: "unit" })).toBe(false)
    expect(isService({ name: "bash", kind: "process" })).toBe(false)
  })

  it("leaves out what is installed but not loaded, and what could not be judged", () => {
    const keys = [...view.kernel, ...view.common, ...view.rows.flatMap((r) => r.groups)].map((g) => g.key)
    expect(keys).not.toContain("expat")
    expect(keys).not.toContain("tzdata")
  })

  it("has nothing common below four services, where half would be what sets them apart", () => {
    const small = buildServicesView(
      [pkg("glibc", { usedBy: ["a.service", "b.service"] }), pkg("nginx", { usedBy: ["a.service"] })],
      [alert("glibc", "CVE-1"), alert("nginx", "CVE-2")],
    )
    expect(small.common).toEqual([])
    expect(small.rows.find((r) => r.name === "a.service")?.groups.map((g) => g.key)).toEqual(["glibc", "nginx"])
  })
})

describe("buildServicesView: which services to restart", () => {
  // Six services, so a library two of them load is their own, not common.
  const users = ["a.service", "b.service", "c.service", "d.service", "e.service", "f.service"]

  it("names the services that hold a replaced file, and not the ones started after the upgrade", () => {
    const view = buildServicesView(
      [pkg("openssl-libs", { sourcePackage: "openssl", usedBy: ["a.service", "b.service"], needsRestart: true, restartNeededBy: ["a.service"] }),
        pkg("glibc", { usedBy: users })],
      [alert("openssl-libs", "CVE-1"), alert("glibc", "CVE-2")],
    )
    const a = view.rows.find((r) => r.name === "a.service")!
    const b = view.rows.find((r) => r.name === "b.service")!
    expect(a.restart).toEqual([{ group: "openssl", need: "yes" }])
    expect(a.groups.find((g) => g.key === "openssl")?.restart).toBe("yes")
    expect(b.restart).toEqual([])
  })

  it("says maybe for every user when an older SBOM does not say which processes hold the old file", () => {
    const view = buildServicesView(
      [pkg("openssl-libs", { usedBy: ["a.service", "b.service"], needsRestart: true }), pkg("glibc", { usedBy: users })],
      [alert("openssl-libs", "CVE-1"), alert("glibc", "CVE-2")],
    )
    expect(view.rows.find((r) => r.name === "a.service")!.restart).toEqual([{ group: "openssl-libs", need: "maybe" }])
    expect(view.rows.find((r) => r.name === "b.service")!.restart).toEqual([{ group: "openssl-libs", need: "maybe" }])
  })

  it("asks for a restart of a common library on the service that holds it, though the library is shown once", () => {
    const view = buildServicesView(
      [pkg("glibc", { usedBy: users, needsRestart: true, restartNeededBy: ["c.service"] })],
      [alert("glibc", "CVE-1")],
    )
    expect(view.common.map((g) => g.key)).toEqual(["glibc"])
    expect(view.rows.find((r) => r.name === "c.service")!.restart).toEqual([{ group: "glibc", need: "yes" }])
    expect(view.rows.find((r) => r.name === "a.service")!.restart).toEqual([])
  })
})
