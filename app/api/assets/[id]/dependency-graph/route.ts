import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { withApiErrorHandling } from "@/lib/api-handler"
import { buildDependencyGraph } from "@/lib/dependency-graph"

export type { DependencyGraphData, GraphEdge, GraphNode, GraphTarget } from "@/lib/dependency-graph"

/**
 * What depends on one of the asset's vulnerable packages (see lib/dependency-graph.ts).
 *
 *   focus   the node to start from (a GraphTarget id); the most urgent one by default
 *   hops    how far up to go, 1 to 8 (4)
 *   expand  comma-separated node ids whose every dependent is drawn, not only the first few
 */
export const GET = withApiErrorHandling("assets.dependencyGraph", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params
  const search = new URL(req.url).searchParams
  const hops = Math.min(8, Math.max(1, parseInt(search.get("hops") ?? "4", 10) || 4))
  const focus = search.get("focus")
  const expand = new Set((search.get("expand") ?? "").split(",").filter((s) => s !== ""))

  const [packages, alerts] = await Promise.all([
    prisma.package.findMany({
      where: { assetId },
      select: { name: true, version: true, ecosystem: true, direct: true, deps: true, sourcePackage: true, inUse: true },
    }),
    prisma.alert.findMany({
      where: { assetId, status: { in: ["open", "in_progress"] } },
      select: { packageName: true, packageVersion: true, externalId: true, severity: true, cvssScore: true, isKev: true },
    }),
  ])

  return NextResponse.json(buildDependencyGraph(packages, alerts, { focus, hops, expand }))
})
