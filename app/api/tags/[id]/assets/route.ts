import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { stringList } from "@/lib/request-body"

export const POST = withApiErrorHandling("tags.assets.update", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: tagId } = await params
  const body = await req.json()
  // assetIds is the tag page's multi-select; a single assetId is still accepted.
  const assetIds = stringList(body.assetIds ?? (body.assetId === undefined ? undefined : [body.assetId]))
  if (!assetIds) {
    return NextResponse.json({ error: "assetIds must be a non-empty array of asset ids" }, { status: 400 })
  }

  if (body.action === "add") {
    await prisma.assetTag.createMany({
      data: assetIds.map((assetId) => ({ tagId, assetId })),
      skipDuplicates: true,
    })
  } else if (body.action === "remove") {
    await prisma.assetTag.deleteMany({ where: { tagId, assetId: { in: assetIds } } })
  } else {
    return NextResponse.json({ error: "action must be add or remove" }, { status: 400 })
  }

  return new NextResponse(null, { status: 204 })
})
