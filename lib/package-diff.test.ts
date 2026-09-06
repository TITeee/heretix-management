import { describe, it, expect } from "vitest"
import { diffPackages, type DiffPackage } from "./package-diff"

type Existing = DiffPackage & { id: string }
type Incoming = DiffPackage & { location?: string }

function existing(id: string, name: string, version: string, ecosystem = "npm"): Existing {
  return { id, name, version, ecosystem }
}

function incoming(name: string, version: string, ecosystem = "npm", location?: string): Incoming {
  return { name, version, ecosystem, location }
}

describe("diffPackages", () => {
  it("puts a package only present in the incoming inventory into toCreate", () => {
    const result = diffPackages<Existing, Incoming>([], [incoming("lodash", "4.17.21")])
    expect(result.toCreate).toEqual([incoming("lodash", "4.17.21")])
    expect(result.toUpdateMeta).toEqual([])
    expect(result.toDelete).toEqual([])
    expect(result.supersededVersions).toEqual([])
  })

  it("pairs a package present in both under the same name/ecosystem/version into toUpdateMeta", () => {
    const ex = existing("id1", "lodash", "4.17.21")
    const inc = incoming("lodash", "4.17.21", "npm", "node_modules/lodash")
    const result = diffPackages([ex], [inc])
    expect(result.toUpdateMeta).toEqual([{ existing: ex, incoming: inc }])
    expect(result.toCreate).toEqual([])
    expect(result.toDelete).toEqual([])
  })

  it("puts a package missing from the incoming inventory into toDelete, with no supersession when the package disappeared outright", () => {
    const ex = existing("id1", "left-pad", "1.3.0")
    const result = diffPackages<Existing, Incoming>([ex], [])
    expect(result.toDelete).toEqual([ex])
    expect(result.supersededVersions).toEqual([])
  })

  it("matches packages on name+ecosystem+version, so the same name at a different version is create+delete, not an update", () => {
    const ex = existing("id1", "lodash", "4.17.20")
    const inc = incoming("lodash", "4.17.21")
    const result = diffPackages([ex], [inc])
    expect(result.toCreate).toEqual([inc])
    expect(result.toDelete).toEqual([ex])
    expect(result.toUpdateMeta).toEqual([])
  })

  it("reports a single-version upgrade as superseded with a successor", () => {
    const ex = existing("id1", "lodash", "4.17.20")
    const inc = incoming("lodash", "4.17.21")
    const result = diffPackages([ex], [inc])
    expect(result.supersededVersions).toEqual([{
      name: "lodash", ecosystem: "npm", version: "4.17.20",
      remainingVersions: ["4.17.21"], successor: "4.17.21",
    }])
  })

  it("leaves successor null when several versions of the package remain after the removal", () => {
    const ex = existing("id1", "lodash", "4.17.19")
    const result = diffPackages(
      [ex],
      [incoming("lodash", "4.17.20"), incoming("lodash", "4.17.21")],
    )
    expect(result.supersededVersions).toEqual([{
      name: "lodash", ecosystem: "npm", version: "4.17.19",
      remainingVersions: ["4.17.20", "4.17.21"], successor: null,
    }])
  })

  it("does not treat packages in different ecosystems as the same supersession group", () => {
    const ex = existing("id1", "request", "1.0.0", "npm")
    const result = diffPackages(
      [ex],
      [incoming("request", "2.0.0", "pypi")],
    )
    expect(result.toDelete).toEqual([ex])
    expect(result.supersededVersions).toEqual([])
  })

  it("keeps toDelete and supersededVersions in sync with a mixed inventory", () => {
    const keep = existing("id1", "kept-pkg", "1.0.0")
    const oldVersion = existing("id2", "upgraded-pkg", "1.0.0")
    const removed = existing("id3", "removed-pkg", "1.0.0")

    const result = diffPackages(
      [keep, oldVersion, removed],
      [incoming("kept-pkg", "1.0.0"), incoming("upgraded-pkg", "2.0.0"), incoming("new-pkg", "1.0.0")],
    )

    expect(result.toCreate.map((p) => p.name)).toEqual(["upgraded-pkg", "new-pkg"])
    expect(result.toUpdateMeta.map((p) => p.existing.name)).toEqual(["kept-pkg"])
    expect(result.toDelete.map((p) => p.name).sort()).toEqual(["removed-pkg", "upgraded-pkg"])
    expect(result.supersededVersions).toEqual([{
      name: "upgraded-pkg", ecosystem: "npm", version: "1.0.0",
      remainingVersions: ["2.0.0"], successor: "2.0.0",
    }])
  })
})
