import { prisma } from "@/lib/db"
import { AlertsTableClient } from "./alerts-table-client"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string; status?: string; severity?: string; packageName?: string }>
}) {
  const params = await searchParams
  const alerts = await prisma.alert.findMany({
    where: {
      ...(params.assetId ? { assetId: params.assetId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.packageName ? { packageName: params.packageName } : {}),
    },
    orderBy: [{ cvssScore: "desc" }, { detectedAt: "desc" }],
    include: { asset: { select: { id: true, name: true, hostname: true } } },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <AlertsTableClient data={alerts} initialPackageName={params.packageName} />
    </div>
  )
}
