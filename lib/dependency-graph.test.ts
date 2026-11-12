import { describe, it, expect } from "vitest"
import { buildPURL } from "./purl"
import { buildDependencyGraph, type GraphAlertInput, type GraphPackageInput } from "./dependency-graph"

const ECO = "Debian:13"
const purl = (name: string, version = "1.0") => buildPURL(name, version, ECO)

function pkg(name: string, deps: string[] = [], over: Partial<GraphPackageInput> = {}): GraphPackageInput {
  return { name, version: "1.0", ecosystem: ECO, direct: false, deps: deps.map((d) => purl(d)), sourcePackage: null, inUse: null, ...over }
}

function alert(packageName: string, externalId: string, over: Partial<GraphAlertInput> = {}): GraphAlertInput {
  return { packageName, packageVersion: "1.0", externalId, severity: "MEDIUM", cvssScore: 5, isKev: false, ...over }
}

const edgeList = (g: { edges: { source: string; target: string }[] }) =>
  g.edges.map((e) => `${e.source.replace("src:", "")}>${e.target.replace("src:", "")}`).sort()

describe("buildDependencyGraph", () => {
  it("starts from the most urgent vulnerable package unless one is chosen", () => {
    const packages = [pkg("zlib1g"), pkg("libssl3t64"), pkg("curl", ["zlib1g", "libssl3t64"], { direct: true })]
    const alerts = [alert("zlib1g", "CVE-1"), alert("libssl3t64", "CVE-2", { isKev: true, severity: "LOW", cvssScore: 2 })]
    const g = buildDependencyGraph(packages, alerts, { hops: 2 })
    expect(g.targets.map((t) => t.name)).toEqual(["libssl3t64", "zlib1g"])
    expect(g.focus).toBe("src:libssl3t64")
    expect(g.nodes.find((n) => n.hop === 0)?.name).toBe("libssl3t64")
    expect(buildDependencyGraph(packages, alerts, { hops: 2, focus: "src:zlib1g" }).focus).toBe("src:zlib1g")
    // An unknown choice falls back to the default rather than drawing nothing.
    expect(buildDependencyGraph(packages, alerts, { hops: 2, focus: "src:nope" }).focus).toBe("src:libssl3t64")
  })

  it("groups OS packages by source package and counts their findings by vulnerability", () => {
    const packages = [
      pkg("libssl3t64", [], { sourcePackage: "openssl" }),
      pkg("openssl", ["libssl3t64"], { sourcePackage: "openssl" }),
      pkg("curl", ["libssl3t64"], { direct: true }),
    ]
    const alerts = [alert("libssl3t64", "CVE-1"), alert("openssl", "CVE-1"), alert("openssl", "CVE-2")]
    const g = buildDependencyGraph(packages, alerts, { hops: 2 })
    const node = g.nodes.find((n) => n.id === "src:openssl")!
    expect(node.packages.map((p) => p.name)).toEqual(["libssl3t64", "openssl"])
    expect(node.vulns).toBe(2)
    // openssl depending on libssl3t64 is inside the node, not an edge to itself.
    expect(edgeList(g)).toEqual(["curl>openssl"])
  })

  it("draws only what depends on the chosen package, up to the hops", () => {
    const packages = [
      pkg("libc6"),
      pkg("libfoo", ["libc6"]),
      pkg("app", ["libfoo"], { direct: true }),
      pkg("unrelated", [], { direct: true }),
    ]
    const g1 = buildDependencyGraph(packages, [alert("libc6", "CVE-1")], { hops: 1 })
    expect(g1.nodes.map((n) => n.name).sort()).toEqual(["libc6", "libfoo"])
    const g2 = buildDependencyGraph(packages, [alert("libc6", "CVE-1")], { hops: 2 })
    expect(g2.nodes.map((n) => n.name).sort()).toEqual(["app", "libc6", "libfoo"])
    expect(g2.dependentsWithinHops).toBe(2)
  })

  it("shows a few dependents of a node that has many and counts the rest, until it is expanded", () => {
    const users = Array.from({ length: 12 }, (_, i) => pkg(`user${String(i).padStart(2, "0")}`, ["libc6"], { direct: i === 11 }))
    const packages = [pkg("libc6"), ...users]
    const g = buildDependencyGraph(packages, [alert("libc6", "CVE-1")], { hops: 1, fanInCap: 4 })
    const libc = g.nodes.find((n) => n.name === "libc6")!
    expect(g.nodes).toHaveLength(5)
    expect(libc.hiddenDependents).toBe(8)
    // A direct package is among those shown.
    expect(g.nodes.map((n) => n.name)).toContain("user11")
    expect(g.dependentsWithinHops).toBe(12)

    const open = buildDependencyGraph(packages, [alert("libc6", "CVE-1")], { hops: 1, fanInCap: 4, expand: new Set(["src:libc6"]) })
    expect(open.nodes).toHaveLength(13)
    expect(open.nodes.find((n) => n.name === "libc6")!.hiddenDependents).toBe(0)
  })

  it("leaves out an edge another path already says, and is not thrown by a cycle", () => {
    // app -> libfoo -> libc6, and app -> libc6 declared too; libc6 and libgcc depend on each other.
    const packages = [
      pkg("libc6", ["libgcc"]),
      pkg("libgcc", ["libc6"]),
      pkg("libfoo", ["libc6"]),
      pkg("app", ["libfoo", "libc6"], { direct: true }),
    ]
    const g = buildDependencyGraph(packages, [alert("libc6", "CVE-1")], { hops: 3 })
    // app -> libc6 is said by app -> libfoo -> libc6. The cycle is drawn as it is, both ways.
    expect(edgeList(g)).toEqual(["app>libfoo", "libc6>libgcc", "libfoo>libc6", "libgcc>libc6"])
  })

  it("keeps language packages apart by version, as their PURL does", () => {
    const npm = (name: string, version: string, deps: string[] = []): GraphPackageInput =>
      ({ name, version, ecosystem: "npm", direct: deps.length > 0, deps, sourcePackage: null })
    const packages = [
      npm("lodash", "4.17.20"),
      npm("lodash", "4.17.21"),
      npm("app-a", "1.0.0", [buildPURL("lodash", "4.17.20", "npm")]),
      npm("app-b", "1.0.0", [buildPURL("lodash", "4.17.21", "npm")]),
    ]
    const g = buildDependencyGraph(packages, [{ ...alert("lodash", "CVE-1"), packageVersion: "4.17.20" }], { hops: 2 })
    expect(g.focus).toBe(buildPURL("lodash", "4.17.20", "npm"))
    expect(g.nodes.map((n) => n.name).sort()).toEqual(["app-a", "lodash"])
  })

  it("has no focus and nothing to draw without vulnerable packages, and says whether there is dependency data", () => {
    const g = buildDependencyGraph([pkg("a", ["b"]), pkg("b")], [], { hops: 2 })
    expect(g).toMatchObject({ hasDepsData: true, focus: null, nodes: [], edges: [], targets: [] })
    expect(buildDependencyGraph([pkg("a")], [], { hops: 2 }).hasDepsData).toBe(false)
  })
})
