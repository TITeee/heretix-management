import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { stringList } from "@/lib/request-body"

// An omitted or empty list is "nothing to do on this side", not an error.
function optionalList(value: unknown): string[] | null {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return []
  return stringList(value)
}

/**
 * Adds and removes tags on one asset. Takes the change as add/remove lists
 * rather than the full set of tags, so a tag assigned elsewhere (e.g. from
 * the tag's own page) meanwhile is not silently dropped.
 */
export const POST = withApiErrorHandling("assets.tags.update", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params
  const body = await req.json()
  const add = optionalList(body.add)
  const remove = optionalList(body.remove)
  if (!add || !remove) {
    return NextResponse.json({ error: "add and remove must be arrays of tag ids" }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  if (add.length > 0) {
    const assetTags = await prisma.tag.count({ where: { id: { in: add }, type: "asset" } })
    if (assetTags !== add.length) {
      return NextResponse.json({ error: "add must contain only existing asset tags" }, { status: 400 })
    }
  }

  await prisma.$transaction([
    prisma.assetTag.createMany({ data: add.map((tagId) => ({ tagId, assetId })), skipDuplicates: true }),
    prisma.assetTag.deleteMany({ where: { assetId, tagId: { in: remove } } }),
  ])

  return new NextResponse(null, { status: 204 })
})
