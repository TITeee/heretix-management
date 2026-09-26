import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"

// Removes a token that no longer works, to keep the list short; the audit log
// keeps its history. An active token has to be revoked first (POST .../revoke),
// so a click here can't silently cut off a CI job that is still using it.
export const DELETE = withApiErrorHandling(
  "apiTokens.delete",
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const existing = await prisma.apiToken.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!existing.revokedAt && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "Revoke the token before deleting it" }, { status: 409 })
    }

    await prisma.apiToken.delete({ where: { id } })
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "api_token_deleted", target: existing.name,
    })
    return NextResponse.json({ id, deleted: true })
  },
)
