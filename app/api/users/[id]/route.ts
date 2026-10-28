import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"
import { readJsonBody } from "@/lib/request-body"
import { passwordProblem } from "@/lib/password"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withApiErrorHandling("users.update", async (req: NextRequest, ctx: Ctx) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await ctx.params
  const body = await readJsonBody(req)
  const { email, password, name, role } = body

  if (role && !["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  if (password) {
    const problem = passwordProblem(password)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
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
  const isPasswordReset = !!password && Object.keys(data).length === 1
  const changedFields = Object.keys(data).filter(k => k !== "password")
  // A new password signs the user out everywhere (see the jwt callback in
  // lib/auth.ts): a session opened with the old one, by whoever knew it, ends.
  if (password) data.sessionVersion = { increment: 1 }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: isPasswordReset ? "user_password_reset" : "user_updated",
    target: user.email,
    detail: isPasswordReset ? undefined : changedFields.join(", "),
  })
  return NextResponse.json(user)
})

export const DELETE = withApiErrorHandling("users.delete", async (_req: NextRequest, ctx: Ctx) => {
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
})
