import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { GET } from "./route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1", email: "test@example.com", name: "Test User", role: "admin" } }),
}))

function get(id: string) {
  return GET(new NextRequest(`http://localhost/api/tags/${id}`), { params: Promise.resolve({ id }) })
}

async function createAsset(name: string) {
  return prisma.asset.create({
    data: { name, hostname: name, osId: "ubuntu", osVersionId: "22.04", osName: "Ubuntu 22.04" },
  })
}

function install(assetId: string, name: string, version: string) {
  return prisma.package.create({
    data: { assetId, name, version, rawVersion: version, ecosystem: "npm", source: "sbom", deps: [] },
  })
}

describe("GET /api/tags/[id]", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("lists, for each package of a package tag, the assets it is installed on, by name and once each", async () => {
    const zeta = await createAsset("zeta")
    const alpha = await createAsset("alpha")
    const other = await createAsset("other")
    // Two versions side by side on one asset count as one asset.
    await install(zeta.id, "lodash", "4.17.20")
    await install(zeta.id, "lodash", "4.17.21")
    await install(alpha.id, "lodash", "4.17.21")
    await install(other.id, "express", "4.19.2")

    const tag = await prisma.tag.create({
      data: {
        name: "watched", type: "package",
        packageTags: { create: [{ packageName: "lodash" }, { packageName: "not-installed" }] },
      },
    })

    const res = await get(tag.id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packageAssets).toEqual({
      lodash: [{ id: alpha.id, name: "alpha" }, { id: zeta.id, name: "zeta" }],
    })
  })

  it("gives an asset tag no package assets", async () => {
    const asset = await createAsset("host-1")
    await install(asset.id, "lodash", "4.17.21")
    const tag = await prisma.tag.create({
      data: { name: "prod", type: "asset", assetTags: { create: [{ assetId: asset.id }] } },
    })

    const body = await (await get(tag.id)).json()
    expect(body.packageAssets).toEqual({})
  })
})
