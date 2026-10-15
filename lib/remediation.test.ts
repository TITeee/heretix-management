import { describe, it, expect } from "vitest"
import { buildRemediationPlan, compareAlertUrgency, isOsEcosystem, type RemediationAlertInput, type RemediationPackageInput } from "./remediation"

let seq = 0
function alert(overrides: Partial<RemediationAlertInput>): RemediationAlertInput {
  return {
    id: `a${++seq}`,
    packageName: "pkg",
    packageVersion: "1.0.0",
    ecosystem: "npm",
    sourcePackage: null,
    fixedVersion: "1.0.1",
    fixStatus: null,
    distroPriority: null,
    severity: "MEDIUM",
    cvssScore: 5,
    isKev: false,
    ...overrides,
  }
}

function pkg(name: string, version: string, direct: boolean | null, deps: string[] = [], ecosystem = "npm", source = "sbom"): RemediationPackageInput {
  return { name, version, ecosystem, direct, deps, source }
}

describe("isOsEcosystem", () => {
  it("tells OS ecosystems from language ones", () => {
    for (const e of ["Debian:12", "Ubuntu:22.04:LTS", "Red Hat:9", "Rocky Linux:9", "Alpine:v3.20", "Oracle Linux:9", "oracle-linux", ""]) {
      expect(isOsEcosystem(e)).toBe(true)
    }
    for (const e of ["npm", "PyPI", "Go", "Maven", "Packagist"]) {
      expect(isOsEcosystem(e)).toBe(false)
    }
  })
})

describe("buildRemediationPlan", () => {
  it("groups fixable OS findings by source package, with their fixed versions", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "openssh", ecosystem: "Red Hat:9", sourcePackage: "openssh", fixedVersion: "8.7p1-45.el9" }),
      alert({ packageName: "openssh-clients", ecosystem: "Red Hat:9", sourcePackage: "openssh", fixedVersion: "8.7p1-45.el9" }),
      alert({ packageName: "curl", ecosystem: "Red Hat:9", sourcePackage: null, fixedVersion: "7.76.1-31.el9" }),
    ], [])
    expect(plan.actions.map((a) => [a.kind, a.target, a.alertIds.length])).toEqual([
      ["os_update", "openssh", 2],
      ["os_update", "curl", 1],
    ])
    expect(plan.actions[0]).toMatchObject({ upgradeTo: [{ package: "openssh", from: "1.0.0", version: "8.7p1-45.el9" }], packages: ["openssh", "openssh-clients"] })
  })

  it("sends a vulnerable direct dependency to direct_upgrade and a transitive one to the direct dependencies above it", () => {
    const packages = [
      pkg("axios", "1.7.0", true),
      pkg("fastify", "4.0.0", true, ["pkg:npm/light-my-request@5.0.0"]),
      pkg("prisma", "6.0.0", true, ["pkg:npm/light-my-request@5.0.0"]),
      // Reached through an indirect hop: the walk continues past it to fastify.
      pkg("light-my-request", "5.0.0", false, ["pkg:npm/cookie@0.5.0"]),
      pkg("cookie", "0.5.0", false),
    ]
    const plan = buildRemediationPlan([
      alert({ packageName: "axios", packageVersion: "1.7.0", fixedVersion: "1.12.0" }),
      alert({ packageName: "axios", packageVersion: "1.7.0", fixedVersion: "1.8.2" }),
      alert({ packageName: "cookie", packageVersion: "0.5.0", fixedVersion: "0.7.0" }),
    ], packages)
    const byKind = Object.fromEntries(plan.actions.map((a) => [a.kind, a]))
    expect(byKind.direct_upgrade).toMatchObject({ target: "axios", upgradeTo: [{ package: "axios", from: "1.7.0", version: "1.12.0" }] })
    expect(byKind.via_direct).toMatchObject({ target: "fastify / prisma", roots: ["fastify", "prisma"], packages: ["cookie"], upgradeTo: [{ package: "cookie", from: "0.5.0", version: "0.7.0" }] })
  })

  it("targets the highest fixed version of a group, compared the way its ecosystem orders versions", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "openssl", ecosystem: "Ubuntu:22.04:LTS", sourcePackage: "openssl", fixedVersion: "3.0.2-0ubuntu1.9" }),
      alert({ packageName: "libssl3", ecosystem: "Ubuntu:22.04:LTS", sourcePackage: "openssl", fixedVersion: "3.0.2-0ubuntu1.15" }),
      alert({ packageName: "openssl", ecosystem: "Ubuntu:22.04:LTS", sourcePackage: "openssl", fixedVersion: "3.0.2-0ubuntu1.10" }),
      alert({ packageName: "kernel", ecosystem: "Rocky Linux:9", sourcePackage: "kernel", fixedVersion: "5.14.0-362.8.1.el9_3" }),
      alert({ packageName: "kernel", ecosystem: "Rocky Linux:9", sourcePackage: "kernel", fixedVersion: "5.14.0-362.13.1.el9_3" }),
    ], [])
    const byTarget = Object.fromEntries(plan.actions.map((a) => [a.target, a.upgradeTo.map((t) => t.version)]))
    // A text sort would pick ...1.9 over ...1.15, and ...362.8 over ...362.13.
    expect(new Set(byTarget.openssl)).toEqual(new Set(["3.0.2-0ubuntu1.15"]))
    expect(new Set(byTarget.kernel)).toEqual(new Set(["5.14.0-362.13.1.el9_3"]))
  })

  it("gives each installed version its own target, so two release lines are not merged into one jump", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "brace-expansion", packageVersion: "2.0.2", fixedVersion: "2.0.3" }),
      alert({ packageName: "brace-expansion", packageVersion: "2.0.2", fixedVersion: "2.1.7" }),
      alert({ packageName: "brace-expansion", packageVersion: "5.0.9", fixedVersion: "5.0.10" }),
      alert({ packageName: "brace-expansion", packageVersion: "5.0.9", fixedVersion: "5.0.12" }),
    ], [pkg("brace-expansion", "2.0.2", true), pkg("brace-expansion", "5.0.9", true)])
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].upgradeTo).toEqual([
      { package: "brace-expansion", from: "2.0.2", version: "2.1.7" },
      { package: "brace-expansion", from: "5.0.9", version: "5.0.12" },
    ])
  })

  it("keeps a single target for one installed version even when its fixes span release lines", () => {
    // 1.24.6 is fixed by 1.24.13 for some findings but only by 1.26.9 for another: 1.26.9 fixes all.
    const plan = buildRemediationPlan([
      alert({ packageName: "stdlib", packageVersion: "go1.24.6", ecosystem: "Go", fixedVersion: "1.24.13" }),
      alert({ packageName: "stdlib", packageVersion: "go1.24.6", ecosystem: "Go", fixedVersion: "1.26.9" }),
      alert({ packageName: "stdlib", packageVersion: "go1.24.6", ecosystem: "Go", fixedVersion: "1.25.8" }),
    ], [pkg("stdlib", "go1.24.6", null, [], "Go")])
    expect(plan.actions[0].upgradeTo).toEqual([{ package: "stdlib", from: "go1.24.6", version: "1.26.9" }])
  })

  it("gives each vulnerable package its own target when findings arrive through a direct dependency", () => {
    const packages = [
      pkg("fastify", "4.0.0", true, ["pkg:npm/cookie@0.5.0", "pkg:npm/minimist@1.2.0"]),
      pkg("cookie", "0.5.0", false),
      pkg("minimist", "1.2.0", false),
    ]
    const plan = buildRemediationPlan([
      alert({ packageName: "cookie", packageVersion: "0.5.0", fixedVersion: "0.6.0" }),
      alert({ packageName: "cookie", packageVersion: "0.5.0", fixedVersion: "0.7.0" }),
      alert({ packageName: "minimist", packageVersion: "1.2.0", fixedVersion: "1.2.6" }),
    ], packages)
    expect(plan.actions).toHaveLength(1)
    // One merged version would compare 0.7.0 with 1.2.6, which belong to different packages.
    expect(plan.actions[0].upgradeTo).toEqual([
      { package: "cookie", from: "0.5.0", version: "0.7.0" },
      { package: "minimist", from: "1.2.0", version: "1.2.6" },
    ])
  })

  it("puts Go's stdlib under go_rebuild and a package with no known parent under package_update", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "stdlib", packageVersion: "go1.22.1", ecosystem: "Go", fixedVersion: "1.22.5" }),
      alert({ packageName: "pip", packageVersion: "23.0", ecosystem: "PyPI", fixedVersion: "23.3" }),
    ], [pkg("stdlib", "go1.22.1", null, [], "Go"), pkg("pip", "23.0", null, [], "PyPI")])
    expect(plan.actions.map((a) => [a.kind, a.target]).sort()).toEqual([["go_rebuild", "stdlib"], ["package_update", "pip"]])
  })

  it("puts a product registered by hand under product_update, whatever ecosystem its findings carry", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "FortiOS", packageVersion: "7.2.4", ecosystem: "", fixedVersion: "7.2.5" }),
      alert({ packageName: "FortiOS", packageVersion: "7.2.4", ecosystem: "advisory", fixedVersion: "7.2.8" }),
    ], [pkg("FortiOS", "7.2.4", null, [], "advisory", "manual")])
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({ kind: "product_update", target: "FortiOS", upgradeTo: [{ package: "FortiOS", from: "7.2.4", version: "7.2.8" }] })
  })

  it("bundles findings with no fixed version by fix status, counting the distro ratings, and never makes them an action", () => {
    const plan = buildRemediationPlan([
      alert({ ecosystem: "Debian:12", fixedVersion: null, fixStatus: null, distroPriority: "unimportant" }),
      alert({ ecosystem: "Debian:12", fixedVersion: null, fixStatus: null, distroPriority: "unimportant" }),
      alert({ ecosystem: "Red Hat:9", fixedVersion: null, fixStatus: "deferred", distroPriority: "low" }),
      alert({ ecosystem: "Red Hat:9", fixedVersion: null, fixStatus: "will_not_fix", distroPriority: null }),
      alert({ ecosystem: "npm", fixedVersion: null }),
    ], [])
    expect(plan.actions).toEqual([])
    const byStatus = Object.fromEntries(plan.noFix.map((g) => [g.key, g]))
    expect(byStatus[""]).toMatchObject({ fixStatus: null, distroPriorities: { unimportant: 2, "": 1 } })
    expect(byStatus.deferred.distroPriorities).toEqual({ low: 1 })
    expect(byStatus.will_not_fix.alertIds).toHaveLength(1)
  })

  it("orders groups KEV first, then by worst severity, then by size", () => {
    const plan = buildRemediationPlan([
      alert({ packageName: "big", ecosystem: "Debian:12", sourcePackage: "big", severity: "HIGH" }),
      alert({ packageName: "big", ecosystem: "Debian:12", sourcePackage: "big", severity: "HIGH" }),
      alert({ packageName: "crit", ecosystem: "Debian:12", sourcePackage: "crit", severity: "CRITICAL" }),
      alert({ packageName: "kev", ecosystem: "Debian:12", sourcePackage: "kev", severity: "LOW", isKev: true }),
    ], [])
    expect(plan.actions.map((a) => a.target)).toEqual(["kev", "crit", "big"])
    expect(plan.actions[1]).toMatchObject({ worst: "critical", severities: { critical: 1 } })
  })
})

describe("compareAlertUrgency", () => {
  const a = (externalId: string, severity: string | null, cvssScore: number | null, isKev = false) => ({ externalId, severity, cvssScore, isKev })

  it("orders KEV first, then severity tier, then CVSS score highest first, then id", () => {
    const sorted = [
      a("CVE-5", "HIGH", 7.5),
      a("CVE-2", "MEDIUM", 6.1),
      a("CVE-4", "CRITICAL", 9.1),
      a("CVE-1", "LOW", 2.0, true),
      a("CVE-3", "CRITICAL", 9.8),
      a("CVE-7", null, null),
      a("CVE-6", "HIGH", 7.5),
    ].sort(compareAlertUrgency)
    expect(sorted.map((x) => x.externalId)).toEqual(["CVE-1", "CVE-3", "CVE-4", "CVE-5", "CVE-6", "CVE-2", "CVE-7"])
  })

  it("tiers by the severity word, not by re-bucketing the score", () => {
    // A CVSS v2 10.0 rated HIGH sorts as High, below a Critical of 9.0.
    const sorted = [a("v2", "HIGH", 10), a("v3", "CRITICAL", 9.0)].sort(compareAlertUrgency)
    expect(sorted.map((x) => x.externalId)).toEqual(["v3", "v2"])
  })
})
