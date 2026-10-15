import { describe, it, expect } from "vitest"
import { compareVersions, maxVersion, versionFlavor, type VersionFlavor } from "./version-compare"

/** Each pair is [lower, higher]; checked both ways round, so a one-sided bug shows up. */
function expectAscending(flavor: VersionFlavor, pairs: [string, string][]) {
  for (const [lo, hi] of pairs) {
    expect(compareVersions(lo, hi, flavor), `${lo} < ${hi}`).toBeLessThan(0)
    expect(compareVersions(hi, lo, flavor), `${hi} > ${lo}`).toBeGreaterThan(0)
  }
}

function expectEqual(flavor: VersionFlavor, pairs: [string, string][]) {
  for (const [a, b] of pairs) {
    expect(compareVersions(a, b, flavor), `${a} == ${b}`).toBe(0)
    expect(compareVersions(b, a, flavor), `${b} == ${a}`).toBe(0)
  }
}

describe("versionFlavor", () => {
  it("uses dpkg rules for Debian and Ubuntu and rpm rules for the other OS ecosystems", () => {
    expect(versionFlavor("Debian:12")).toBe("deb")
    expect(versionFlavor("Ubuntu:22.04:LTS")).toBe("deb")
    for (const e of ["Red Hat:9", "Rocky Linux:9", "AlmaLinux:9", "Alpine:v3.20", "Oracle Linux:9", "oracle-linux", "CentOS:7", ""]) {
      expect(versionFlavor(e)).toBe("rpm")
    }
  })
})

describe("compareVersions: generic (language packages and products)", () => {
  it("compares dotted numbers numerically, not as text", () => {
    expectAscending("generic", [
      ["1.8.2", "1.12.0"],
      ["1.9", "1.10"],
      ["9.9.9", "10.0.0"],
      ["1.22.5", "1.23.0"],
      ["7.2.5", "7.2.8"],
      ["2.9.99", "2.10.0"],
    ])
  })

  it("treats missing trailing zeros as equal and extra segments as newer", () => {
    expectEqual("generic", [["1.0", "1.0.0"], ["2", "2.0.0.0"]])
    expectAscending("generic", [["17.5.1", "17.5.1.4"], ["15.1.10", "15.1.10.2"]])
  })

  it("ignores a leading v and build metadata", () => {
    expectEqual("generic", [["v1.2.3", "1.2.3"], ["1.2.3+build5", "1.2.3"], ["1.2.3+a", "1.2.3+b"]])
  })

  it("orders semver pre-releases below the release, following the spec's order", () => {
    const chain = [
      "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0",
    ]
    for (let i = 0; i < chain.length - 1; i++) expectAscending("generic", [[chain[i], chain[i + 1]]])
  })

  it("orders PEP 440 and other attached pre-release spellings below the release", () => {
    expectAscending("generic", [
      ["1.0rc1", "1.0"],
      ["2.0b3", "2.0rc1"],
      ["2.0a1", "2.0b1"],
      ["1.0.dev1", "1.0a1"],
      ["2.0.0-SNAPSHOT", "2.0.0"],
      ["3.1.0-beta1", "3.1.0-beta2"],
      ["3.1.0-rc1", "3.1.0-rc10"],
    ])
  })

  it("orders post-release and patch suffixes above the plain release", () => {
    expectAscending("generic", [
      ["1.0", "1.0.post1"],
      ["8.7", "8.7p1"],
      ["8.7p1", "8.7p2"],
      ["8.7p2", "8.8"],
      ["8.9p1", "9.0"],
      ["5.3.20.RELEASE", "5.3.21.RELEASE"],
    ])
  })

  it("does not let a pre-release of a higher number beat a lower release", () => {
    expectAscending("generic", [["1.9.9", "2.0.0-rc.1"], ["2.0.0-rc.1", "2.0.0"]])
  })

  it("falls back to a stable total order for versions with no leading number", () => {
    expectAscending("generic", [["abc", "abd"], ["build-5", "build-12"]])
    expectEqual("generic", [["abc", "abc"]])
  })
})

describe("compareVersions: deb (dpkg)", () => {
  it("orders distro revisions numerically", () => {
    expectAscending("deb", [
      ["8.7p1-38", "8.7p1-45"],
      ["3.0.2-0ubuntu1.9", "3.0.2-0ubuntu1.10"],
      ["3.0.11-1~deb12u2", "3.0.11-1~deb12u10"],
      ["2.36-9+deb12u3", "2.36-9+deb12u10"],
      ["1.0-1", "1.0-2"],
      ["1.0-1ubuntu0.20.04.2", "1.0-1ubuntu0.20.04.10"],
    ])
  })

  it("puts the upstream version before the revision", () => {
    expectAscending("deb", [["1.9-5", "1.10-1"], ["2.0-9", "2.1-1"]])
  })

  it("sorts a tilde below everything, including the end of the version", () => {
    expectAscending("deb", [
      ["1.0~rc1", "1.0"],
      ["1.0~~", "1.0~"],
      ["1.0~", "1.0"],
      ["1.0-1~bpo12+1", "1.0-1"],
      ["1.0~rc1", "1.0~rc2"],
    ])
  })

  it("sorts letters before other punctuation and both above the end", () => {
    expectAscending("deb", [["1.0", "1.0a"], ["1.0a", "1.0+b1"], ["1.0", "1.0+b1"]])
  })

  it("lets an epoch outrank the rest", () => {
    expectAscending("deb", [["2.0-1", "1:1.0-1"], ["1:1.0", "2:0.1"]])
    expectEqual("deb", [["0:1.0-1", "1.0-1"]])
  })

  it("ignores leading zeros in a number", () => {
    expectEqual("deb", [["1.01", "1.1"], ["2.0-001", "2.0-1"]])
  })

  it("splits the revision at the last hyphen only", () => {
    expectAscending("deb", [["1.0-a-1", "1.0-a-2"], ["1.0-a-9", "1.0-b-1"]])
  })
})

describe("compareVersions: rpm", () => {
  it("orders version-release numerically", () => {
    expectAscending("rpm", [
      ["8.7p1-38.el9", "8.7p1-45.el9"],
      ["5.14.0-362.8.1.el9_3", "5.14.0-362.13.1.el9_3"],
      ["7.76.1-31.el9", "7.76.1-31.el9_4"],
      ["1.9", "1.10"],
      ["1.0.9", "1.0.10"],
    ])
  })

  it("orders Alpine's -r revisions numerically", () => {
    expectAscending("rpm", [["3.1.4-r5", "3.1.4-r10"], ["3.1.4-r10", "3.1.5-r0"]])
  })

  it("lets a numeric segment beat an alphabetic one", () => {
    expectAscending("rpm", [["1.0.a", "1.0.1"], ["1.0a", "1.0.1"]])
  })

  it("sorts a tilde below the end of the version and a caret above it", () => {
    expectAscending("rpm", [
      ["1.0~rc1", "1.0"],
      ["1.0~rc1", "1.0~rc2"],
      ["1.0~~", "1.0~"],
      ["1.0", "1.0^git1"],
      ["1.0^git1", "1.0.1"],
      ["1.0^git1", "1.0^git2"],
    ])
  })

  it("treats separators as equivalent and ignores leading zeros", () => {
    expectEqual("rpm", [["1.0", "1_0"], ["1.01", "1.1"], ["1.0-1", "1.0.1"]])
  })

  it("lets an epoch outrank the rest", () => {
    expectAscending("rpm", [["9.9-1", "1:1.0-1"], ["1:9.9", "2:0.1"]])
    expectEqual("rpm", [["0:1.0-1", "1.0-1"]])
  })

  it("treats an empty version as the lowest", () => {
    expectAscending("rpm", [["", "0.1"]])
  })
})

describe("compareVersions: properties", () => {
  const samples: Record<VersionFlavor, string[]> = {
    generic: ["1.0", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.9", "1.10", "2.0b1", "2.0", "8.7p1", "8.7p2", "10.0.0", "abc"],
    deb: ["1.0~rc1", "1.0", "1.0-1", "1.0-1ubuntu0.2", "1.0-1ubuntu0.10", "1.0+b1", "1:0.9", "2.0-1", "2.0-1~bpo1"],
    rpm: ["1.0~rc1", "1.0", "1.0^git1", "1.0.1", "1.0-1.el9", "1.0-1.el9_3", "1.0-10.el9", "1:0.1", "2.0"],
  }

  for (const flavor of Object.keys(samples) as VersionFlavor[]) {
    const list = samples[flavor]

    it(`${flavor}: is antisymmetric and reflexive`, () => {
      for (const a of list) {
        expect(compareVersions(a, a, flavor)).toBe(0)
        for (const b of list) {
          expect(Math.sign(compareVersions(a, b, flavor)) + 0).toBe(-Math.sign(compareVersions(b, a, flavor)) + 0)
        }
      }
    })

    it(`${flavor}: is transitive`, () => {
      for (const a of list) for (const b of list) for (const c of list) {
        if (compareVersions(a, b, flavor) <= 0 && compareVersions(b, c, flavor) <= 0) {
          expect(compareVersions(a, c, flavor), `${a} <= ${b} <= ${c}`).toBeLessThanOrEqual(0)
        }
      }
    })

    it(`${flavor}: gives the same order whatever order it starts from`, () => {
      const sortWith = (xs: string[]) => [...xs].sort((a, b) => compareVersions(a, b, flavor))
      const forward = sortWith(list)
      const backward = sortWith([...list].reverse())
      const shuffled = sortWith([...list].sort((a, b) => (a < b ? 1 : -1)))
      // Versions that compare equal (1.0 and 1.0.0) may swap places, so compare by rank, not text.
      for (const other of [backward, shuffled]) {
        other.forEach((v, i) => expect(compareVersions(v, forward[i], flavor), `position ${i}`).toBe(0))
      }
    })
  }
})

describe("maxVersion", () => {
  it("picks the highest by the flavor's rules, not by text", () => {
    expect(maxVersion(["1.8.2", "1.12.0"], "generic")).toBe("1.12.0")
    expect(maxVersion(["8.7p1-38.el9", "8.7p1-45.el9", "8.7p1-9.el9"], "rpm")).toBe("8.7p1-45.el9")
    expect(maxVersion(["3.0.2-0ubuntu1.9", "3.0.2-0ubuntu1.15", "3.0.2-0ubuntu1.10"], "deb")).toBe("3.0.2-0ubuntu1.15")
    expect(maxVersion(["7.2.5", "7.2.8", "7.2.10"], "generic")).toBe("7.2.10")
  })

  it("does not depend on the order of the list", () => {
    const list = ["1.0.0-rc.1", "1.0.0", "0.9.9", "1.0.0-beta"]
    expect(maxVersion(list, "generic")).toBe("1.0.0")
    expect(maxVersion([...list].reverse(), "generic")).toBe("1.0.0")
  })

  it("returns the only version, and null for an empty list", () => {
    expect(maxVersion(["4.17.21"])).toBe("4.17.21")
    expect(maxVersion([])).toBeNull()
  })
})
