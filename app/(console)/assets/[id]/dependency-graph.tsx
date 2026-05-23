"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { GraphNode, GraphEdge, DependencyGraphData } from "@/app/api/assets/[id]/dependency-graph/route"
import { applyDagreLayout } from "@/lib/dagre-layout"

function buildLayout(data: DependencyGraphData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = data.nodes.map((n: GraphNode) => ({
    id: n.id,
    position: { x: 0, y: 0 },
    data: {
      label: (
        <div className="text-left px-1">
          <div className="font-semibold text-xs break-all">{n.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{n.version}</div>
          {n.direct && <div className="text-[10px] text-blue-600 font-medium">Direct</div>}
          {n.vulnerable && n.alertCount > 0 && (
            <div className="text-[10px] text-red-600 font-medium">{n.alertCount} alert{n.alertCount > 1 ? "s" : ""}</div>
          )}
        </div>
      ),
    },
    style: {
      background: n.vulnerable ? "#fee2e2" : n.direct ? "#dbeafe" : "#f9fafb",
      border: n.vulnerable ? "2px solid #dc2626" : n.direct ? "2px solid #2563eb" : "1px solid #e5e7eb",
      borderRadius: 8,
      width: 180,
      fontSize: 12,
      color: "#111827",
    },
  }))

  const edges: Edge[] = data.edges.map((e: GraphEdge, i: number) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    style: { stroke: "#9ca3af", strokeWidth: 1.5 },
  }))

  return applyDagreLayout(nodes, edges)
}

export function DependencyGraph({ assetId }: { assetId: string }) {
  const [data, setData] = useState<DependencyGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hops, setHops] = useState(4)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const load = useCallback(async (h: number) => {
    setLoading(true)
    const res = await fetch(`/api/assets/${assetId}/dependency-graph?hops=${h}`)
    const json: DependencyGraphData = await res.json()
    setData(json)
    if (json.hasDepsData && json.nodes.length > 0) {
      const { nodes: n, edges: e } = buildLayout(json)
      setNodes(n)
      setEdges(e)
    }
    setLoading(false)
  }, [assetId, setNodes, setEdges])

  useEffect(() => { load(hops) }, [load, hops])

  if (loading) return <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">Loading dependency graph…</div>

  if (!data?.hasDepsData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm">No dependency graph data available.</p>
        <p className="text-xs opacity-70">Dependency data is available for npm and pnpm packages imported via SBOM.</p>
      </div>
    )
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm">No vulnerable packages found, or no dependency paths to display.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-100 border-2 border-red-600" /> Vulnerable</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border-2 border-blue-600" /> Direct dep</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gray-100 border border-gray-300" /> Indirect dep</span>
        <div className="ml-auto flex items-center gap-2">
          <span>Hops:</span>
          <select
            value={hops}
            onChange={e => setHops(Number(e.target.value))}
            className="h-6 rounded border border-input bg-background px-1.5 text-xs"
          >
            {[1,2,3,4,5,6,7,8].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ height: 800 }} className="rounded-md border overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} color="#f0f0f0" />
          <Controls style={{ backgroundColor: "white", color: "#374151", borderColor: "#e5e7eb" }} />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>
      </div>
    </div>
  )
}
