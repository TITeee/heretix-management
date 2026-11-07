import { describe, it, expect } from "vitest"
import { groupAssetsByPackageVersion, packageVersionKey } from "./package-assets"

const asset = (id: string, name: string) => ({ id, name })

describe("groupAssetsByPackageVersion", () => {
  it("lists the assets of each version of a package separately", () => {
    const map = groupAssetsByPackageVersion([
      { name: "openssl", version: "3.0.13", asset: asset("a1", "web-01") },
      { name: "openssl", version: "3.0.2", asset: asset("a2", "db-01") },
      { name: "openssl", version: "3.0.13", asset: asset("a3", "app-01") },
    ])
    expect(map.get(packageVersionKey("openssl", "3.0.13"))?.map((a) => a.name)).toEqual(["app-01", "web-01"])
    expect(map.get(packageVersionKey("openssl", "3.0.2"))?.map((a) => a.name)).toEqual(["db-01"])
  })

  it("counts an asset once when it holds the same name and version twice", () => {
    const map = groupAssetsByPackageVersion([
      { name: "curl", version: "8.5.0", asset: asset("a1", "web-01") },
      { name: "curl", version: "8.5.0", asset: asset("a1", "web-01") },
    ])
    expect(map.get(packageVersionKey("curl", "8.5.0"))).toEqual([asset("a1", "web-01")])
  })

  it("has no entry for a version nothing is installed with", () => {
    expect(groupAssetsByPackageVersion([]).get(packageVersionKey("curl", "8.5.0"))).toBeUndefined()
  })
})
