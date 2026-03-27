import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { status, notes } = body

  const update: { status?: string; notes?: string; resolvedAt?: Date | null } = {}
  if (status) {
    update.status = status
    update.resolvedAt = status === "resolved" ? new Date() : null
  }
  if (notes !== undefined) update.notes = notes

  // Fetch the previous value before changing status
  let prevStatus: string | undefined
  if (status) {
    const current = await prisma.alert.findUnique({ where: { id }, select: { status: true } })
    prevStatus = current?.status
  }

  const alert = await prisma.alert.update({ where: { id }, data: update })

  // Record a status_changed event
  if (status && prevStatus && prevStatus !== status) {
    await prisma.alertEvent.create({
      data: {
        alertId: id,
        type: "status_changed",
        data: { from: prevStatus, to: status },
      },
    })
  }

  // Record a notes_saved event
  if (notes !== undefined && notes.trim().length > 0) {
    await prisma.alertEvent.create({
      data: {
        alertId: id,
        type: "notes_saved",
        data: {},
      },
    })
  }

  return NextResponse.json(alert)
}
