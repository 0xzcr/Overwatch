"use client";
import dynamic from "next/dynamic";
import { useCanRender3D } from "./useWebGL";
import type { GlobeNode } from "./RadarGlobe";

const RadarGlobe = dynamic(() => import("./RadarGlobe"), { ssr: false });

export function Hero3D({ nodes }: { nodes: GlobeNode[] }) {
  const { ready, webgl, reduced } = useCanRender3D();
  if (!ready) return null;
  if (!webgl) return <StaticRadar nodes={nodes} />;
  return <RadarGlobe nodes={nodes} reduced={reduced} />;
}

function StaticRadar({ nodes }: { nodes: GlobeNode[] }) {
  return (
    <svg viewBox="-100 -100 200 200" className="w-full h-full opacity-80" aria-hidden>
      {[30, 55, 80].map((r) => <circle key={r} r={r} fill="none" stroke="var(--line-2)" />)}
      {nodes.map((n, i) => { const a = (i / nodes.length) * Math.PI * 2; const r = 40 + (i % 3) * 18; return <circle key={n.slug} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={2.6} fill={n.red ? "var(--bad)" : "var(--ok)"} />; })}
    </svg>
  );
}
