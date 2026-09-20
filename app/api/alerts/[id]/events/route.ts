import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"

export const GET = withApiErrorHandling("alerts.events.byAlert", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const events = await prisma.alertEvent.findMany({
    where: { alertId: id },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(events)
})
