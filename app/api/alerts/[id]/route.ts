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
  const { status, notes, vexJustification } = body

  const update: { status?: string; notes?: string; resolvedAt?: Date | null; vexJustification?: string | null } = {}
  if (status) {
    update.status = status
    update.resolvedAt = status === "resolved" ? new Date() : null
    // Clear vexJustification when moving away from ignored
    if (status !== "ignored") update.vexJustification = null
  }
  if (notes !== undefined) update.notes = notes
  if (vexJustification !== undefined) update.vexJustification = vexJustification || null

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

  // Record a vex_justification_set event
  if (vexJustification !== undefined && vexJustification) {
    await prisma.alertEvent.create({
      data: {
        alertId: id,
        type: "vex_justification_set",
        data: {
          justification: vexJustification,
          userName: session.user?.name ?? session.user?.email ?? "Unknown",
        },
      },
    })
  }

  // Record a notes_saved event
  if (notes !== undefined && notes.trim().length > 0) {
    await prisma.alertEvent.create({
      data: {
        alertId: id,
        type: "notes_saved",
        data: {
          notes: notes.trim(),
          userName: session.user?.name ?? session.user?.email ?? "Unknown",
        },
      },
    })
  }

  return NextResponse.json(alert)
}
