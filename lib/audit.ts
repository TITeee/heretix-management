import { prisma } from "@/lib/db"

export async function createAuditLog(params: {
  userId?: string | null
  userEmail?: string | null
  action: string
  target?: string
  detail?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        action: params.action,
        target: params.target ?? null,
        detail: params.detail ?? null,
      },
    })
  } catch {
    // Audit log failures must never break the main flow
  }
}
