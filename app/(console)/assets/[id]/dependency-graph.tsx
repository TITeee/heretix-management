"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Maximize2, Minimize2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SeverityBadge } from "@/components/alerts/vuln-detail-tabs"
import { AlertDetailSheet, type SheetAlert } from "@/components/alerts/alert-detail-sheet"
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
import type { GraphNode, GraphEdge, DependencyGraphData } from "@/lib/dependency-graph"
import { applyDagreLayout } from "@/lib/dagre-layout"

// The id of the node standing for a node's dependents that are not drawn.
const MORE_PREFIX = "more:"

function buildLayout(data: DependencyGraphData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = data.nodes.map((n: GraphNode) => ({
    id: n.id,
    position: { x: 0, y: 0 },
    data: {
      label: (
        <div className="text-left px-1">
          <div className="font-semibold text-xs break-all">{n.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {n.version || `${n.packages.length} packages`}
          </div>
          {n.direct && <div className="text-[10px] text-blue-600 font-medium">Direct</div>}
          {n.vulnerable && (
            <div className="text-[10px] text-red-600 font-medium">{n.vulns} {n.vulns === 1 ? "vulnerability" : "vulnerabilities"}</div>
          )}
        </div>
      ),
    },
    style: {
      background: n.vulnerable ? "#fee2e2" : n.direct ? "#dbeafe" : "#f9fafb",
      border: n.hop === 0 ? "3px solid #dc2626" : n.vulnerable ? "2px solid #dc2626" : n.direct ? "2px solid #2563eb" : "1px solid #e5e7eb",
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

  // A node with more dependents than are drawn gets one more node above it, which opens them.
  for (const n of data.nodes) {
    if (n.hiddenDependents === 0) continue
    nodes.push({
      id: `${MORE_PREFIX}${n.id}`,
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div className="text-center text-xs text-muted-foreground" title={`${n.hiddenDependents} more packages depend on ${n.name}. Click to show them.`}>
            +{n.hiddenDependents} more
          </div>
        ),
      },
      style: { background: "#ffffff", border: "1px dashed #9ca3af", borderRadius: 8, width: 180, fontSize: 12, cursor: "pointer" },
    })
    edges.push({
      id: `${MORE_PREFIX}e${n.id}`,
      source: `${MORE_PREFIX}${n.id}`,
      target: n.id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "4 3" },
    })
  }

  return applyDagreLayout(nodes, edges)
}


export function DependencyGraph({ assetId }: { assetId: string }) {
  const [data, setData] = useState<DependencyGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hops, setHops] = useState(4)
  // Which vulnerable package the graph starts from (null: the server's default, the most
  // urgent), and the nodes whose every dependent is drawn.
  const [focus, setFocus] = useState<string | null>(null)
  const [expand, setExpand] = useState<string[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  // The selected node's alerts, by package: an alert belongs to one package, and a node can
  // hold several (a source package's binaries, openssl-libs and openssl).
  const [nodeAlerts, setNodeAlerts] = useState<{ name: string; version: string; alerts: SheetAlert[] }[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<SheetAlert | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close the side panel on any click outside it, except: clicks on a graph node
  // (onNodeClick below owns that transition — switch to the new node, or close for a
  // non-vulnerable one) and clicks inside the alert detail Sheet, which renders into
  // a portal outside this panel's DOM subtree and manages its own open state.
  //
  // Registered on the capture phase: React Flow's pan/zoom handling stops
  // propagation on pointer events inside the canvas (pane, controls, minimap), so a
  // bubble-phase document listener never sees clicks there. Capture fires on the way
  // down, before that happens, so it isn't affected.
  useEffect(() => {
    if (!selectedNode) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest(".react-flow__node")) return
      if (target.closest('[data-slot="sheet-content"], [data-slot="sheet-overlay"]')) return
      if (panelRef.current && !panelRef.current.contains(target)) {
        setSelectedNode(null)
      }
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    return () => document.removeEventListener("mousedown", handlePointerDown, true)
  }, [selectedNode])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith(MORE_PREFIX)) {
      const id = node.id.slice(MORE_PREFIX.length)
      setExpand(prev => (prev.includes(id) ? prev : [...prev, id]))
      return
    }
    const graphNode = data?.nodes.find(n => n.id === node.id)
    if (!graphNode?.vulnerable) {
      setSelectedNode(null)
      return
    }
    setSelectedNode(graphNode)
    setAlertsLoading(true)
    // A node is a source package's binaries (openssl-libs, openssl): list the alerts of each, once.
    Promise.all(graphNode.packages.map(p =>
      fetch(`/api/alerts?assetId=${assetId}&packageName=${encodeURIComponent(p.name)}&packageVersion=${encodeURIComponent(p.version)}`)
        .then(r => r.json())
        .then(d => (Array.isArray(d) ? d : (d.alerts ?? [])) as SheetAlert[])
        .catch(() => [] as SheetAlert[])
    ))
      .then(lists => {
        setNodeAlerts(graphNode.packages
          .map((p, i) => ({ name: p.name, version: p.version, alerts: lists[i] }))
          .filter(p => p.alerts.length > 0))
      })
      .finally(() => setAlertsLoading(false))
  }, [data, assetId])

  const load = useCallback(async (h: number, f: string | null, x: string[]) => {
    setLoading(true)
    const q = new URLSearchParams({ hops: String(h) })
    if (f) q.set("focus", f)
    if (x.length > 0) q.set("expand", x.join(","))
    const res = await fetch(`/api/assets/${assetId}/dependency-graph?${q}`)
    const json: DependencyGraphData = await res.json()
    setData(json)
    if (json.hasDepsData && json.nodes.length > 0) {
      const { nodes: n, edges: e } = buildLayout(json)
      setNodes(n)
      setEdges(e)
    }
    setLoading(false)
  }, [assetId, setNodes, setEdges])

  useEffect(() => { load(hops, focus, expand); setSelectedNode(null) }, [load, hops, focus, expand])

  if (loading) return <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">Loading dependency graph…</div>

  if (!data?.hasDepsData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm">No dependency graph data available.</p>
        <p className="text-xs opacity-70">The SBOM records no dependencies between these packages. heretix-cli records them for OS packages and lockfiles; other scanners often do not.</p>
      </div>
    )
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm">No vulnerable packages to start from.</p>
      </div>
    )
  }

  const drawn = data.nodes.length - 1
  const toolbar = (
    <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-1.5">
        <span>Starting from</span>
        <select
          value={data.focus ?? ""}
          onChange={e => { setFocus(e.target.value); setExpand([]) }}
          className="h-6 max-w-64 rounded border border-input bg-background px-1.5 text-xs"
        >
          {data.targets.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.vulns}{t.kev > 0 ? ", KEV" : ""})
            </option>
          ))}
        </select>
      </label>
      <span title="Packages depending on it within the hops; the ones not drawn are behind +N more">
        {data.dependentsWithinHops === 0
          ? "Nothing depends on it"
          : `${drawn} of ${data.dependentsWithinHops} dependents drawn`}
      </span>
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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFullscreen(f => !f)}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )

  // z-60: above the fullscreen container's fixed inset-0 z-50 — same z-index would
  // leave the outcome to DOM order, which puts the fullscreen graph on top and hides
  // this panel behind it.
  const alertPanel = selectedNode && (
    <div ref={panelRef} className="fixed left-0 top-0 z-60 h-full w-80 border-r bg-background shadow-xl flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{selectedNode.name}</p>
          <p className="text-xs text-muted-foreground">
            {selectedNode.packages.length === 1
              ? <span className="font-mono">{selectedNode.packages[0].version}</span>
              : `${selectedNode.packages.length} packages`}
            {" · "}{selectedNode.vulns} {selectedNode.vulns === 1 ? "vulnerability" : "vulnerabilities"}
          </p>
        </div>
        <button onClick={() => setSelectedNode(null)} className="ml-2 shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {alertsLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : nodeAlerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No alerts found.</p>
        ) : (
          nodeAlerts.map(p => (
            <div key={`${p.name}@${p.version}`} className="space-y-1.5">
              {/* One heading per package, its alerts under it. A package of one node only
                  needs its name when the node holds others. */}
              {selectedNode.packages.length > 1 && (
                <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                  <span className="min-w-0 text-xs font-semibold break-all">
                    {p.name} <span className="font-mono font-normal text-muted-foreground">{p.version}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {p.alerts.length} {p.alerts.length === 1 ? "alert" : "alerts"}
                  </span>
                </div>
              )}
              {p.alerts.map(a => (
                <button
                  key={a.id}
                  className="flex items-center gap-2 text-xs w-full text-left hover:bg-accent rounded px-1 py-0.5"
                  onClick={() => { setSelectedAlert(a); setSheetOpen(true) }}
                >
                  <SeverityBadge score={a.cvssScore} severity={a.severity} />
                  <span className="font-mono break-all">{a.externalId}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )

  const graph = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
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
  )

  const detailSheet = (
    <AlertDetailSheet
      alert={selectedAlert}
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      onStatusChange={(alertId, status) => {
        setNodeAlerts(prev => prev.map(p => ({ ...p, alerts: p.alerts.map(a => a.id === alertId ? { ...a, status } : a) })))
      }}
    />
  )

  if (isFullscreen) {
    return (
      <>
        {detailSheet}
        {alertPanel}
        <div className="fixed inset-0 z-50 bg-background flex flex-col p-4">
          {toolbar}
          <div className="flex-1 rounded-md border overflow-hidden">
            {graph}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {detailSheet}
      {alertPanel}
      <div>
        {toolbar}
        <div style={{ height: 800 }} className="rounded-md border overflow-hidden">
          {graph}
        </div>
      </div>
    </>
  )
}
