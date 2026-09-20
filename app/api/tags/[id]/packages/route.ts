import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"

export const POST = withApiErrorHandling("tags.packages.update", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: tagId } = await params
  const { action, packageName } = await req.json()

  if (action === "add") {
    await prisma.packageTag.upsert({
      where: { tagId_packageName: { tagId, packageName } },
      create: { tagId, packageName },
      update: {},
    })
  } else if (action === "remove") {
    await prisma.packageTag.deleteMany({ where: { tagId, packageName } })
  } else {
    return NextResponse.json({ error: "action must be add or remove" }, { status: 400 })
  }

  return new NextResponse(null, { status: 204 })
})
