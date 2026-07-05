import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { DEFAULT_SLA_CONFIG, type SlaConfig } from "@/lib/sla"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const setting = await prisma.setting.findUnique({
    where: { key: "sla_config" },
  })

  if (!setting) {
    return NextResponse.json(DEFAULT_SLA_CONFIG)
  }

  try {
    const config = JSON.parse(setting.value) as SlaConfig
    return NextResponse.json(config)
  } catch {
    // If parsing fails, return defaults
    return NextResponse.json(DEFAULT_SLA_CONFIG)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const config = (await req.json()) as Partial<SlaConfig>

  // Validate config
  const validated = {
    slaCriticalHours: Math.max(1, config.slaCriticalHours ?? DEFAULT_SLA_CONFIG.slaCriticalHours),
    slaHighHours: Math.max(1, config.slaHighHours ?? DEFAULT_SLA_CONFIG.slaHighHours),
    slaMediumDays: Math.max(1, config.slaMediumDays ?? DEFAULT_SLA_CONFIG.slaMediumDays),
    slaLowDays: Math.max(1, config.slaLowDays ?? DEFAULT_SLA_CONFIG.slaLowDays),
    kevSlaHours: Math.max(1, config.kevSlaHours ?? DEFAULT_SLA_CONFIG.kevSlaHours),
  }

  await prisma.setting.upsert({
    where: { key: "sla_config" },
    update: { value: JSON.stringify(validated) },
    create: { key: "sla_config", value: JSON.stringify(validated) },
  })

  return NextResponse.json(validated)
}
