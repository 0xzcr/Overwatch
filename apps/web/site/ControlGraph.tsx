"use client";
import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GEdge, GNode } from "@/lib/graph";

const KIND_LABEL: Record<GNode["kind"], string> = {
  program: "Program",
  authority: "Upgrade authority",
  multisig: "Multisig",
  signer: "Signer",
  nonce: "Durable nonce",
  config: "Config authority",
  mint: "Collateral",
  oracle: "Oracle",
  admin: "Admin",
};

/** "Who can move your money": Program → upgrade authority -> multisig -> signers (-> nonce accounts), plus collateral and oracles. */
export function ControlGraph({
  nodes,
  edges,
  network,
  summary,
}: {
  nodes: GNode[];
  edges: GEdge[];
  network: "mainnet" | "devnet";
  summary?: boolean;
}) {
  const [sel, setSel] = useState<GNode | null>(null);
  const { rfNodes, rfEdges } = useMemo(() => {
    const counts = new Map<number, number>();
    const perLayer = new Map<number, number>();
    nodes.forEach((n) => perLayer.set(n.layer, (perLayer.get(n.layer) ?? 0) + 1));
    const rfNodes: Node[] = nodes.map((n) => {
      const i = counts.get(n.layer) ?? 0;
      counts.set(n.layer, i + 1);
      const total = perLayer.get(n.layer) ?? 1;
      return {
        id: n.id,
        position: { x: (i - (total - 1) / 2) * 190, y: n.layer * 130 },
        data: {
          label: (
            <div className="cg__node">
              <span className="cg__kind">{KIND_LABEL[n.kind]}</span>
              <b>{n.label}</b>
              <span>{n.sub}</span>
            </div>
          ),
        },
        className: `cg__rf cg__rf--${n.kind}${n.danger ? " is-danger" : ""}`,
      };
    });
    const rfEdges: Edge[] = edges.map((e, i) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: true,
      className: e.danger ? "cg__edge is-danger" : "cg__edge",
    }));
    return { rfNodes, rfEdges };
  }, [nodes, edges]);

  if (!nodes.length) return <p className="mono page-note">No snapshot yet.</p>;
  return (
    <div className="cg" data-lenis-prevent>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        nodesDraggable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        onNodeClick={(_, n) => setSel(nodes.find((x) => x.id === n.id) ?? null)}
      >
        <Background color="rgba(150,180,255,0.12)" gap={28} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="cg__hint mono">
        {summary
          ? "summary from the snapshot · addresses load with live data"
          : "click a node · pinch or use controls to zoom"}
      </div>
      {sel && (
        <div className="cg__panel">
          <div className="cg__panel-top mono">
            <span>{KIND_LABEL[sel.kind]}</span>
            <button onClick={() => setSel(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <b className={sel.danger ? "bad" : ""}>{sel.label}</b>
          <span className="mono">{sel.sub}</span>
          {sel.address && (
            <a
              className="mono addr"
              href={`https://explorer.solana.com/address/${sel.address}${network === "devnet" ? "?cluster=devnet" : ""}`}
              target="_blank"
              rel="noreferrer"
            >
              {sel.address} ↗
            </a>
          )}
        </div>
      )}
      <ul className="sr-only">
        {edges.map((e, i) => (
          <li key={i}>
            {nodes.find((n) => n.id === e.from)?.label} → {nodes.find((n) => n.id === e.to)?.label}
            {e.label ? ` (${e.label})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
