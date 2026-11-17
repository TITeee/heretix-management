import { describe, it, expect } from "vitest"
import { buildPURL } from "@/lib/purl"
import { buildDependents, PATH_COUNT_CAP, type DependentsPackageInput } from "./dependents"

type Spec = Partial<DependentsPackageInput> & { name: string; deps?: string[] }

/** Packages of one ecosystem and version; deps name other packages of the same. */
function pkgs(specs: Spec[], ecosystem = "npm", version = "1.0.0"): DependentsPackageInput[] {
  return specs.map((s) => ({
    direct: false, sourcePackage: null, scope: null, category: null, inUse: null,
    ...s,
    version, ecosystem,
    deps: (s.deps ?? []).map((d) => buildPURL(d, version, ecosystem)),
  }))
}
const npm = (specs: Spec[]) => pkgs(specs)

const target = (name: string, ecosystem = "npm", version = "1.0.0") => ({ name, version, ecosystem })

describe("buildDependents", () => {
  it("finds the direct dependency however far up it is, with the shortest path", () => {
    // app -> a1 -> ... -> a6 -> vuln: seven hops, past the old five-hop cut.
    const chain = ["a1", "a2", "a3", "a4", "a5", "a6"]
    const pkgs = npm([
      { name: "app", direct: true, deps: ["a1"] },
      ...chain.map((n, i) => ({ name: n, deps: [chain[i + 1] ?? "vuln"] })),
      { name: "vuln" },
    ])
    const data = buildDependents(pkgs, target("vuln"), new Set())
    expect(data.dependents).toBe(7)
    expect(data.directDependents).toBe(1)
    expect(data.entries.map((e) => e.name)).toEqual(["app"])
    expect(data.entries[0].path).toEqual(["app", ...chain, "vuln"])
    expect(data.entries[0].otherPaths).toBe(0)
  })

  it("gives one entry per direct dependency however many paths there are, and counts them", () => {
    // root -> m1..m3 -> n1..n3 -> vuln: nine paths from root.
    const ms = ["m1", "m2", "m3"], ns = ["n1", "n2", "n3"]
    const pkgs = npm([
      { name: "root", direct: true, deps: ms },
      ...ms.map((m) => ({ name: m, deps: ns })),
      ...ns.map((n) => ({ name: n, deps: ["vuln"] })),
      { name: "vuln" },
    ])
    const data = buildDependents(pkgs, target("vuln"), new Set())
    expect(data).toMatchObject({ dependents: 7, directDependents: 3 })
    const [entry] = data.entries
    expect(entry).toMatchObject({ name: "root", otherPaths: 8, otherPathsCapped: false })
    expect(entry.path).toHaveLength(4)
  })

  it("stops counting paths at the cap", () => {
    // Four layers of ten packages: 10^4 paths from root.
    const layers = [0, 1, 2, 3].map((l) => Array.from({ length: 10 }, (_, i) => `l${l}-${i}`))
    const pkgs = npm([
      { name: "root", direct: true, deps: layers[0] },
      ...layers.flatMap((layer, l) => layer.map((n) => ({ name: n, deps: layers[l + 1] ?? ["vuln"] }))),
      { name: "vuln" },
    ])
    const [entry] = buildDependents(pkgs, target("vuln"), new Set()).entries
    expect(entry).toMatchObject({ otherPaths: PATH_COUNT_CAP, otherPathsCapped: true })
  })

  it("follows a dependency cycle without looping", () => {
    const pkgs = npm([
      { name: "root", direct: true, deps: ["a"] },
      { name: "a", deps: ["b"] },
      { name: "b", deps: ["a", "vuln"] },
      { name: "vuln" },
    ])
    const data = buildDependents(pkgs, target("vuln"), new Set())
    expect(data.entries.map((e) => e.name)).toEqual(["root"])
    expect(data.dependents).toBe(3)
  })

  it("takes the top of the tree as the entry points when nothing is marked direct", () => {
    const pkgs = npm([
      { name: "top1", direct: null, deps: ["mid"] },
      { name: "top2", direct: null, deps: ["vuln"] },
      { name: "mid", direct: null, deps: ["vuln"] },
      { name: "vuln", direct: null },
    ])
    const names = buildDependents(pkgs, target("vuln"), new Set()).entries.map((e) => e.name).sort()
    expect(names).toEqual(["top1", "top2"])
  })

  it("groups OS packages by source package, and shows the path of the member that runs the target", () => {
    const rhel = pkgs([
      { name: "kernel-core", sourcePackage: "kernel", direct: true, deps: ["kernel-modules-core"] },
      { name: "kernel-modules-core", sourcePackage: "kernel", direct: false, deps: ["openssl-libs"] },
      { name: "kernel-tools", sourcePackage: "kernel", direct: true, inUse: true, usedBy: ["tuned.service"], deps: ["openssl-libs"] },
      { name: "openssl-libs", sourcePackage: "openssl", inUse: true, usedBy: ["tuned.service", "sshd.service"] },
    ], "Red Hat:9", "5.14.0")
    const data = buildDependents(rhel, target("openssl-libs", "Red Hat:9", "5.14.0"), new Set())
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]).toMatchObject({
      key: "src:kernel", name: "kernel", running: true, services: ["tuned.service"], direct: true,
      path: ["kernel-tools", "openssl-libs"],
      otherPaths: 1,
    })
    expect(data.entries[0].packages.map((p) => p.name)).toEqual(["kernel-core", "kernel-tools"])
    expect(data.target?.graphId).toBe("src:openssl")
  })

  it("does not call an entry running when its services do not load the target", () => {
    // NetworkManager runs, but the path goes through NetworkManager-cloud-setup and libcurl,
    // and no service had openssl-libs loaded through it.
    const rhel = pkgs([
      { name: "NetworkManager", sourcePackage: "NetworkManager", direct: true, inUse: true, usedBy: ["NetworkManager.service"] },
      { name: "NetworkManager-cloud-setup", sourcePackage: "NetworkManager", direct: true, deps: ["libcurl"] },
      { name: "libcurl", sourcePackage: "curl", deps: ["openssl-libs"] },
      { name: "openssl-libs", sourcePackage: "openssl", inUse: true, usedBy: ["sshd.service"] },
    ], "Red Hat:9", "5.14.0")
    const [entry] = buildDependents(rhel, target("openssl-libs", "Red Hat:9", "5.14.0"), new Set()).entries
    expect(entry).toMatchObject({ name: "NetworkManager", running: false, services: [], direct: true })
  })

  it("sorts running, then direct, then vulnerable; metapackages, dev and never-run last", () => {
    const pkgs = npm([
      { name: "dev-tool", direct: true, scope: "excluded", deps: ["vuln"] },
      { name: "direct-two", direct: true, deps: ["vuln"] },
      { name: "plain", direct: false, deps: ["vuln"] },
      { name: "vulnerable-top", direct: false, deps: ["vuln"] },
      { name: "direct-one", direct: true, deps: ["vuln"] },
      { name: "loaded", direct: false, inUse: true, usedBy: ["app.service"], deps: ["vuln"] },
      { name: "vuln", inUse: true, usedBy: ["app.service"] },
    ])
    const vulnerable = new Set([`vulnerable-top\u00001.0.0`])
    const order = buildDependents(pkgs, target("vuln"), vulnerable).entries.map((e) => e.name)
    expect(order.slice(0, 5)).toEqual(["loaded", "direct-one", "direct-two", "vulnerable-top", "plain"])
    expect(order[order.length - 1]).toBe("dev-tool")
  })

  it("marks a Debian metapackage and puts it after the rest", () => {
    const ubuntu = pkgs([
      { name: "ubuntu-server", sourcePackage: "ubuntu-meta", direct: true, deps: ["libc6"] },
      { name: "openssh-server", sourcePackage: "openssh", direct: true, deps: ["libc6"] },
      { name: "libc6", sourcePackage: "glibc" },
    ], "Ubuntu:24.04:LTS")
    const entries = buildDependents(ubuntu, target("libc6", "Ubuntu:24.04:LTS"), new Set()).entries
    expect(entries.map((e) => [e.name, e.meta])).toEqual([["openssh", false], ["ubuntu-meta", true]])
  })

  it("says when nothing depends on the package, and when there is no dependency data or package", () => {
    const pkgs = npm([{ name: "other", direct: true, deps: ["x"] }, { name: "x" }, { name: "vuln", direct: true }])
    const alone = buildDependents(pkgs, target("vuln"), new Set())
    expect(alone).toMatchObject({ hasDepsData: true, dependents: 0, entries: [] })
    expect(alone.target?.direct).toBe(true)

    expect(buildDependents(npm([{ name: "vuln" }]), target("vuln"), new Set()).hasDepsData).toBe(false)
    expect(buildDependents(pkgs, target("gone"), new Set()).target).toBeNull()
  })
})
