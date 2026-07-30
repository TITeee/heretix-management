import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { calculateDueDate, DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const setting = await prisma.setting.findUnique({ where: { key: "sla_config" } })
  let slaConfig = DEFAULT_SLA_CONFIG
  if (setting) {
    try {
      slaConfig = { ...DEFAULT_SLA_CONFIG, ...(JSON.parse(setting.value) as Partial<SlaConfig>) }
    } catch {
      // Use default if parsing fails
    }
  }

  const alerts = await prisma.alert.findMany({
    where: { status: { in: ["open", "in_progress"] } },
    select: { id: true, cvssScore: true, isKev: true, detectedAt: true },
  })

  let updated = 0
  for (const alert of alerts) {
    const newDueDate = calculateDueDate(alert.cvssScore, alert.isKev, alert.detectedAt, slaConfig)
    await prisma.alert.update({ where: { id: alert.id }, data: { dueDate: newDueDate } })
    updated++
  }

  return NextResponse.json({ updated, total: alerts.length })
}
