import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { createAuditLog } from "@/lib/audit"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await ctx.params
  const body = await req.json()
  const { email, password, name, role } = body

  if (role && !["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  // Prevent changing own role
  if (id === session.user.id && role && role !== session.user.role) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
  }

  // Check email uniqueness if changing
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }
  }

  const data: Record<string, unknown> = {}
  if (email !== undefined) data.email = email
  if (name !== undefined) data.name = name || null
  if (role !== undefined) data.role = role
  if (password) data.password = await bcrypt.hash(password, 12)

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  const isPasswordReset = !!password && Object.keys(data).length === 1
  const changedFields = Object.keys(data).filter(k => k !== "password")
  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: isPasswordReset ? "user_password_reset" : "user_updated",
    target: user.email,
    detail: isPasswordReset ? undefined : changedFields.join(", "),
  })
  return NextResponse.json(user)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await ctx.params

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } })
  await prisma.user.delete({ where: { id } })
  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: "user_deleted", target: target?.email,
  })
  return NextResponse.json({ ok: true })
}
