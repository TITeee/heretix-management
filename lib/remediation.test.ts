import { describe, it, expect } from "vitest"
import { buildRemediationPlan, isOsEcosystem, type RemediationAlertInput, type RemediationPackageInput } from "./remediation"

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
    expect(plan.actions[0]).toMatchObject({ fixedVersions: ["8.7p1-45.el9"], packages: ["openssh", "openssh-clients"] })
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
    expect(byKind.direct_upgrade).toMatchObject({ target: "axios", fixedVersions: ["1.12.0", "1.8.2"] })
    expect(byKind.via_direct).toMatchObject({ target: "fastify / prisma", roots: ["fastify", "prisma"], packages: ["cookie"] })
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
    expect(plan.actions[0]).toMatchObject({ kind: "product_update", target: "FortiOS", fixedVersions: ["7.2.5", "7.2.8"] })
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
