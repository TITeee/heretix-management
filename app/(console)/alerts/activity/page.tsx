import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ActivityTable } from "./activity-table"

export default async function AlertActivityPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const events = await prisma.alertEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
    include: {
      alert: {
        select: {
          externalId: true,
          packageName: true,
          packageVersion: true,
          asset: { select: { id: true, name: true, hostname: true } },
        },
      },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/alerts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Alerts
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Alert Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">All alert events: status changes, detections, metadata updates.</p>
      </div>
      <ActivityTable events={JSON.parse(JSON.stringify(events))} />
    </div>
  )
}
