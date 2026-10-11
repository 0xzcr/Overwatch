"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ReactFlow, Background, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ControlSnapshot } from "@overwatch/core";
import { buildGraph, type GNode } from "@/lib/graph";
import { useCanRender3D } from "./three/useWebGL";
import { Addr } from "./ui/Addr";

const Graph3D = dynamic(() => import("./three/ControlGraph3D"), { ssr: false });

export function ControlGraph({ snapshot, network }: { snapshot: ControlSnapshot | null; network: "mainnet" | "devnet" }) {
  const g = useMemo(() => buildGraph(snapshot), [snapshot]);
  const { ready, webgl, reduced } = useCanRender3D();
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [sel, setSel] = useState<GNode | null>(null);
  const use3d = ready && webgl && mode === "3d";
  if (!g.nodes.length) return <p className="mono text-dim text-sm">No snapshot yet.</p>;
  return (
    <div className="relative border hairline h-[560px] bg-[radial-gradient(ellipse_at_center,var(--bg-2),var(--bg))] overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex gap-1">
        {(["3d", "2d"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`mono text-[11px] px-2.5 h-7 border ${mode === m ? "border-[var(--accent)] text-accent" : "hairline text-dim"}`}>{m}</button>)}
      </div>
      <div className="absolute top-3 right-3 z-10 mono text-[10px] text-dim hidden sm:block">drag to orbit · scroll to zoom · click a node</div>
      {use3d ? <Graph3D nodes={g.nodes} edges={g.edges} onSelect={setSel} selected={sel?.id ?? null} reduced={reduced} /> : <Flow2D nodes={g.nodes} edges={g.edges} onSelect={setSel} />}
      {sel && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-80 panel p-4 z-10">
          <div className="flex justify-between items-start"><span className="label">{sel.kind}</span><button onClick={() => setSel(null)} className="text-dim hover:text-ink" aria-label="close">×</button></div>
          <p className="text-lg mt-1" style={{ color: sel.danger ? "var(--bad)" : "var(--ink)" }}>{sel.label}</p>
          {sel.address && <p className="mt-2 text-xs"><Addr v={sel.address} network={network} full /></p>}
        </div>
      )}
      <ul className="sr-only">{g.edges.map((e, i) => <li key={i}>{g.nodes.find((n) => n.id === e.from)?.label} → {g.nodes.find((n) => n.id === e.to)?.label}{e.label ? ` (${e.label})` : ""}</li>)}</ul>
    </div>
  );
}

function Flow2D({ nodes, edges, onSelect }: { nodes: GNode[]; edges: ReturnType<typeof buildGraph>["edges"]; onSelect: (n: GNode) => void }) {
  const counts = new Map<number, number>();
  const rf: Node[] = nodes.map((n) => {
    const i = counts.get(n.layer) ?? 0;
    counts.set(n.layer, i + 1);
    return { id: n.id, position: { x: i * 170, y: n.layer * 120 }, data: { label: <div className="mono text-[10px] leading-tight"><div style={{ color: n.danger ? "var(--bad)" : "var(--ink)" }}>{n.label}</div><div className="text-dim">{n.sub}</div></div> },
      style: { background: "var(--bg-2)", border: `1px solid ${n.danger ? "var(--bad)" : "var(--line-2)"}`, borderRadius: 0, color: "var(--ink)", width: 150, padding: 6 } };
  });
  const re: Edge[] = edges.map((e, i) => ({ id: `e${i}`, source: e.from, target: e.to, label: e.label, animated: !!e.danger, style: { stroke: e.danger ? "var(--bad)" : "var(--dim)" }, labelStyle: { fill: "var(--chrome)", fontSize: 9 }, labelBgStyle: { fill: "var(--bg)" } }));
  return <ReactFlow nodes={rf} edges={re} fitView proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => { const g = nodes.find((x) => x.id === n.id); if (g) onSelect(g); }} colorMode="dark"><Background color="#222" gap={24} /></ReactFlow>;
}
