"use client"

import dynamic from "next/dynamic"

// @xyflow/react is a large library only needed by the Dependency Graph tab.
// `ssr: false` requires a Client Component boundary (page.tsx is a Server
// Component), hence this thin wrapper — it keeps the library out of every
// other tab's bundle and off the initial page load entirely.
const DependencyGraph = dynamic(
  () => import("./dependency-graph").then((mod) => mod.DependencyGraph),
  { ssr: false, loading: () => <div className="p-6 text-sm text-muted-foreground">Loading dependency graph...</div> }
)

export function DependencyGraphLoader({ assetId }: { assetId: string }) {
  return <DependencyGraph assetId={assetId} />
}
