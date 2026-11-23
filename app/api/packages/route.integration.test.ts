import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { auth } from "@/lib/auth"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

const get = async (query: string) => (await GET(new NextRequest(`http://localhost/api/packages?${query}`))).json()
const names = async (search: string, extra = "") => (await get(`search=${encodeURIComponent(search)}${extra}`)).map((p: { name: string }) => p.name)

describe("GET /api/packages", () => {
  beforeEach(async () => {
    await resetDb()
    const asset = await prisma.asset.create({ data: { name: "h", hostname: "h", osId: "u", osVersionId: "1", osName: "u" } })
    const add = (name: string, version = "1") =>
      prisma.package.create({ data: { assetId: asset.id, name, version, rawVersion: version, ecosystem: "npm", source: "sbom", deps: [] } })
    for (const name of ["lodash", "lodash-es", "Lodash.merge", "disk 100% pure", "disk 1000 pure", "a_b", "axb", "c\\d"]) await add(name)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("rejects an unauthenticated request, and answers an empty search with nothing", async () => {
    mockedAuth.mockResolvedValueOnce(null)
    expect((await GET(new NextRequest("http://localhost/api/packages?search=lodash"))).status).toBe(401)
    expect(await get("search=")).toEqual([])
  })

  it("lists the exact name first, then the others that contain it, ignoring case", async () => {
    // The order of the others is the database's (its collation decides how case and punctuation sort).
    const all = await names("lodash")
    expect(all[0]).toBe("lodash")
    expect([...all].sort()).toEqual(["Lodash.merge", "lodash", "lodash-es"])
    const two = await names("LODASH", "&limit=2")
    expect(two).toHaveLength(2)
    expect(two[0]).toBe("lodash")
  })

  it("takes %, _ and a backslash in the search as the characters they are", async () => {
    expect(await names("100%")).toEqual(["disk 100% pure"])
    expect(await names("%")).toEqual(["disk 100% pure"])
    expect(await names("a_b")).toEqual(["a_b"])
    expect(await names("c\\")).toEqual(["c\\d"])
  })
})
