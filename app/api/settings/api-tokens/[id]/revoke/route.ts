import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"

// Revoking stops a token working immediately but keeps its row, so the list
// still shows what existed and when it stopped; DELETE on the token removes it.
export const POST = withApiErrorHandling(
  "apiTokens.revoke",
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const existing = await prisma.apiToken.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (existing.revokedAt) return NextResponse.json({ id, revokedAt: existing.revokedAt })

    const token = await prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    })
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "api_token_revoked", target: existing.name,
    })
    return NextResponse.json(token)
  },
)
