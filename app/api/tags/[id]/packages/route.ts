import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { stringList } from "@/lib/request-body"

export const POST = withApiErrorHandling("tags.packages.update", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: tagId } = await params
  const body = await req.json()
  // packageNames is the tag page's multi-select; a single packageName is still accepted.
  const packageNames = stringList(body.packageNames ?? (body.packageName === undefined ? undefined : [body.packageName]))
  if (!packageNames) {
    return NextResponse.json({ error: "packageNames must be a non-empty array of package names" }, { status: 400 })
  }

  if (body.action === "add") {
    await prisma.packageTag.createMany({
      data: packageNames.map((packageName) => ({ tagId, packageName })),
      skipDuplicates: true,
    })
  } else if (body.action === "remove") {
    await prisma.packageTag.deleteMany({ where: { tagId, packageName: { in: packageNames } } })
  } else {
    return NextResponse.json({ error: "action must be add or remove" }, { status: 400 })
  }

  return new NextResponse(null, { status: 204 })
})
