import { describe, it, expect } from "vitest"
import { mergeNoData, noDataList, parseNoData } from "./no-data"

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
})
