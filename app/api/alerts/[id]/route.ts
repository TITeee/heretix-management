import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { isIgnoreReason, REASON_REQUIRES_JUSTIFICATION } from "@/lib/vex"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { status, notes, vexJustification, ignoreReason } = body

  const update: {
    status?: string
    notes?: string
    resolvedAt?: Date | null
    vexJustification?: string | null
    ignoreReason?: string | null
  } = {}

  // Ignoring an alert is a judgment that has to say what kind of judgment it is,
  // otherwise it silently drops out of the VEX export with no way to find it again.
  if (status === "ignored") {
    const current = await prisma.alert.findUnique({
      where: { id },
      select: { ignoreReason: true, vexJustification: true },
    })
    const effectiveReason = ignoreReason !== undefined ? ignoreReason : current?.ignoreReason
    const effectiveJustification =
      vexJustification !== undefined ? vexJustification : current?.vexJustification

    if (!isIgnoreReason(effectiveReason)) {
      return NextResponse.json({ error: "ignoreReason is required when status is ignored" }, { status: 400 })
    }
    if (effectiveReason === REASON_REQUIRES_JUSTIFICATION && !effectiveJustification) {
      return NextResponse.json(
        { error: "vexJustification is required when ignoreReason is not_affected" },
        { status: 400 }
      )
    }
  }

  // Both fields describe an ignore decision, so neither survives leaving that state.
  const leavingIgnored = status !== undefined && status !== "ignored"

  if (status) {
    update.status = status
    update.resolvedAt = status === "resolved" ? new Date() : null
  }
  if (notes !== undefined) update.notes = notes

  if (leavingIgnored) {
    update.ignoreReason = null
    update.vexJustification = null
  } else {
    if (ignoreReason !== undefined) update.ignoreReason = ignoreReason || null
    if (vexJustification !== undefined) update.vexJustification = vexJustification || null
    // A justification only means anything under not_affected.
    if (update.ignoreReason && update.ignoreReason !== REASON_REQUIRES_JUSTIFICATION) {
      update.vexJustification = null
    }
  }

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
        data: {
          from: prevStatus,
          to: status,
          ...(alert.ignoreReason ? { ignoreReason: alert.ignoreReason } : {}),
          userName: session.user?.name ?? session.user?.email ?? "Unknown",
        },
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
