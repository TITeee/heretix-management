import { describe, it, expect } from "vitest"
import { isUnsearchableEcosystem, mergeNoData, noDataList, parseNoData, splitNoData } from "./no-data"

describe("no-data helpers", () => {
  it("adds the batches of a scan together, most packages first", () => {
    const total = new Map<string, number>()
    mergeNoData(total, [{ ecosystem: "Alpine:v3.24", packages: 5 }, { ecosystem: "npm", packages: 2 }])
    mergeNoData(total, [{ ecosystem: "npm", packages: 7 }])
    expect(noDataList(total)).toEqual([{ ecosystem: "npm", packages: 9 }, { ecosystem: "Alpine:v3.24", packages: 5 }])
  })

  it("has nothing to store when there is nothing", () => {
    expect(noDataList(new Map())).toBeNull()
  })

  it("keeps only well-formed entries of a stored value", () => {
    expect(parseNoData([{ ecosystem: "npm", packages: 1 }, { ecosystem: 3 }, null, "x"])).toEqual([{ ecosystem: "npm", packages: 1 }])
    expect(parseNoData(null)).toEqual([])
    expect(parseNoData({ ecosystem: "npm" })).toEqual([])
  })

  it("tells the ecosystems no scanner lookup can reach from those that are only not loaded", () => {
    expect(["generic", "pear", "unknown", "Generic"].map(isUnsearchableEcosystem)).toEqual([true, true, true, true])
    expect(["npm", "Go", "Debian:13", "advisory", ""].map(isUnsearchableEcosystem)).toEqual([false, false, false, false, false])
    expect(splitNoData([{ ecosystem: "Go", packages: 4 }, { ecosystem: "generic", packages: 3 }, { ecosystem: "pear", packages: 5 }])).toEqual({
      notLoaded: [{ ecosystem: "Go", packages: 4 }],
      notSearchable: [{ ecosystem: "generic", packages: 3 }, { ecosystem: "pear", packages: 5 }],
    })
  })
})
