import { describe, it, expect } from "vitest"
import { distroName, distroPriorityLabel, distroPrioritySortKey, osvDistroRatings } from "./distro-priority"

describe("osvDistroRatings", () => {
  it("uses the record's own rating (Ubuntu)", () => {
    expect(osvDistroRatings({ distroPriority: "medium", affectedPackages: [{ ecosystem: "Ubuntu:22.04:LTS" }] }))
      .toEqual(["medium"])
  })

  it("collapses per-release ratings that agree (Debian)", () => {
    expect(osvDistroRatings({
      distroPriority: null,
      affectedPackages: [
        { ecosystem: "Debian:12", distroPriority: "not yet assigned" },
        { ecosystem: "Debian:13", distroPriority: "not yet assigned" },
      ],
    })).toEqual(["not yet assigned"])
  })

  it("lists per-release ratings that differ", () => {
    expect(osvDistroRatings({
      affectedPackages: [
        { ecosystem: "Debian:13", distroPriority: "low" },
        { ecosystem: "Debian:12", distroPriority: "unimportant" },
        { ecosystem: "Debian:11", distroPriority: null },
      ],
    })).toEqual(["Debian 12: unimportant", "Debian 13: low"])
  })

  it("is empty when nothing is rated", () => {
    expect(osvDistroRatings({ affectedPackages: [{ ecosystem: "PyPI" }] })).toEqual([])
  })
})

describe("distroPrioritySortKey", () => {
  const key = distroPrioritySortKey

  it("orders by severity within a distro, not alphabetically", () => {
    const redHat = ["critical", "low", "important", "moderate"]
      .sort((a, b) => key("Red Hat:9", a)!.localeCompare(key("Red Hat:9", b)!))
    expect(redHat).toEqual(["low", "moderate", "important", "critical"])
    expect(key("Ubuntu:22.04:LTS", "negligible")! < key("Ubuntu:22.04:LTS", "low")!).toBe(true)
  })

  it("groups by distro rather than equating scales", () => {
    // Red Hat's most severe still sorts before any Ubuntu rating.
    expect(key("Red Hat:9", "critical")! < key("Ubuntu:24.04:LTS", "negligible")!).toBe(true)
  })

  it("is undefined for no rating or one that isn't a severity", () => {
    expect(key("Red Hat:9", null)).toBeUndefined()
    expect(key("Debian:12", "end-of-life")).toBeUndefined()
    expect(key("Debian:12", "not yet assigned")).toBeUndefined()
    expect(key("Alpine:v3.20", "low")).toBeUndefined()
  })
})

describe("distroPriorityLabel", () => {
  it("names the distro from the ecosystem", () => {
    expect(distroPriorityLabel("Red Hat:9", "low")).toBe("Red Hat: low")
    expect(distroPriorityLabel("Ubuntu:22.04:LTS", "negligible")).toBe("Ubuntu: negligible")
    expect(distroPriorityLabel("Debian:12", "not yet assigned")).toBe("Debian: not yet assigned")
  })

  it("is null without a rating", () => {
    expect(distroPriorityLabel("Red Hat:9", null)).toBeNull()
    expect(distroPriorityLabel("npm", undefined)).toBeNull()
    expect(distroPriorityLabel("Alpine:v3.20", "")).toBeNull()
  })
})

describe("distroName", () => {
  it("keeps a multi-word distro name whole", () => {
    expect(distroName("Oracle Linux:9")).toBe("Oracle Linux")
    expect(distroName("Rocky Linux:9")).toBe("Rocky Linux")
  })
})
