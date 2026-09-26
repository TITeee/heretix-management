import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"
import {
  API_TOKEN_SCOPES,
  MAX_TOKEN_LIFETIME_DAYS,
  generateApiToken,
  hashApiToken,
  isApiTokenScope,
} from "@/lib/api-token"

// Token management is session-only and admin-only: these routes call auth(),
// not authenticate(), so an API token can never mint or revoke tokens.

const listFields = {
  id: true, name: true, prefix: true, scopes: true, createdByEmail: true,
  createdAt: true, expiresAt: true, lastUsedAt: true, revokedAt: true,
} as const

export const GET = withApiErrorHandling("apiTokens.list", async () => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tokens = await prisma.apiToken.findMany({ select: listFields, orderBy: { createdAt: "desc" } })
  return NextResponse.json(tokens)
})

export const POST = withApiErrorHandling("apiTokens.create", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const scopes: unknown[] = Array.isArray(body.scopes) ? body.scopes : []
  if (scopes.length === 0 || !scopes.every(isApiTokenScope)) {
    return NextResponse.json(
      { error: `scopes must be a non-empty subset of: ${API_TOKEN_SCOPES.join(", ")}` },
      { status: 400 },
    )
  }

  const days = body.expiresInDays
  if (!Number.isInteger(days) || days < 1 || days > MAX_TOKEN_LIFETIME_DAYS) {
    return NextResponse.json(
      { error: `expiresInDays must be a whole number from 1 to ${MAX_TOKEN_LIFETIME_DAYS}` },
      { status: 400 },
    )
  }

  const token = generateApiToken()
  const created = await prisma.apiToken.create({
    data: {
      name,
      tokenHash: hashApiToken(token),
      prefix: token.slice(0, 8),
      scopes: [...new Set(scopes)],
      createdById: session.user.id,
      createdByEmail: session.user.email,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
    select: listFields,
  })

  await createAuditLog({
    userId: session.user.id, userEmail: session.user.email,
    action: "api_token_created", target: name,
    detail: `scopes: ${created.scopes.join(", ")}, expires: ${created.expiresAt.toISOString()}`,
  })
  // The plaintext token is returned this once and is not recoverable afterwards.
  return NextResponse.json({ ...created, token }, { status: 201 })
})
