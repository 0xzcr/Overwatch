"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { GEdge, GNode } from "@/lib/graph";

const KIND_COLOR: Record<string, string> = { program: "#ebe6db", authority: "#a9a49a", multisig: "#ffb547", signer: "#8fb8ff", nonce: "#ff5d4f", config: "#ff5d4f", mint: "#7fd18b", oracle: "#7fd18b", admin: "#a9a49a" };

function layout(nodes: GNode[]) {
  const byLayer = new Map<number, GNode[]>();
  for (const n of nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
  const pos = new Map<string, THREE.Vector3>();
  for (const [layer, ns] of byLayer) {
    const y = 2.2 - layer * 1.25;
    const radius = layer === 3 ? Math.max(1.6, ns.length * 0.32) : Math.max(0.6, ns.length * 0.55);
    ns.forEach((n, i) => {
      if (ns.length === 1) return pos.set(n.id, new THREE.Vector3(0, y, 0));
      const a = (i / ns.length) * Math.PI * 2 + layer * 0.6;
      pos.set(n.id, new THREE.Vector3(Math.cos(a) * radius, y + (layer === 3 ? Math.sin(a * 2) * 0.12 : 0), Math.sin(a) * radius));
    });
  }
  return pos;
}

function NodeMesh({ n, p, onSelect, selected }: { n: GNode; p: THREE.Vector3; onSelect: (n: GNode) => void; selected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = n.danger ? "#ff5d4f" : KIND_COLOR[n.kind]!;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.01;
    if (n.danger) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.12);
  });
  const geo = n.kind === "multisig" ? <octahedronGeometry args={[0.2]} /> : n.kind === "program" ? <boxGeometry args={[0.32, 0.32, 0.32]} /> : n.kind === "nonce" ? <tetrahedronGeometry args={[0.15]} /> : <sphereGeometry args={[n.kind === "signer" ? 0.09 : 0.13, 20, 20]} />;
  return (
    <group position={p}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(n); }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }} onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}>
        {geo}
        <meshBasicMaterial color={color} wireframe={n.kind === "program" || n.kind === "multisig"} toneMapped={false} />
      </mesh>
      <Html center position={[0, -0.32, 0]} distanceFactor={8} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className={`mono text-center whitespace-nowrap leading-tight transition-opacity ${hover || selected || n.kind !== "signer" || n.danger ? "opacity-100" : "opacity-40"}`}>
          <div className="text-[11px]" style={{ color }}>{n.label}</div>
          <div className="text-[9px] text-[#6d6b66]">{n.sub}</div>
        </div>
      </Html>
    </group>
  );
}

function Edge({ a, b, e }: { a: THREE.Vector3; b: THREE.Vector3; e: GEdge }) {
  const pts = useMemo(() => {
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.15, 0));
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(24);
  }, [a, b]);
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const t = (((clock.elapsedTime * (e.danger ? 0.7 : 0.25) + Math.abs(a.x)) % 1) + 1) % 1;
    const i = Math.floor(t * (pts.length - 1));
    pulse.current.position.copy(pts[i]!);
  });
  const color = e.danger ? "#ff5d4f" : "#6d6b66";
  return (
    <group>
      <Line points={pts} color={color} lineWidth={e.danger ? 1.6 : 0.8} transparent opacity={e.danger ? 0.9 : 0.5} dashed={!e.danger} dashSize={0.05} gapSize={0.05} />
      <mesh ref={pulse}><sphereGeometry args={[0.025, 8, 8]} /><meshBasicMaterial color={e.danger ? "#ff5d4f" : "#ffb547"} toneMapped={false} /></mesh>
    </group>
  );
}

export default function ControlGraph3D({ nodes, edges, onSelect, selected, reduced }: { nodes: GNode[]; edges: GEdge[]; onSelect: (n: GNode) => void; selected: string | null; reduced: boolean }) {
  const pos = useMemo(() => layout(nodes), [nodes]);
  return (
    <Canvas camera={{ position: [0, 1.2, 7.5], fov: 45 }} dpr={[1, 1.8]} frameloop={reduced ? "demand" : "always"} gl={{ alpha: true, antialias: true }}>
      <gridHelper args={[14, 28, "#1f1e1b", "#141412"]} position={[0, -3.4, 0]} />
      {edges.map((e, i) => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? <Edge key={i} a={a} b={b} e={e} /> : null; })}
      {nodes.map((n) => <NodeMesh key={n.id} n={n} p={pos.get(n.id)!} onSelect={onSelect} selected={selected === n.id} />)}
      <OrbitControls enablePan={false} minDistance={3.5} maxDistance={14} autoRotate={!reduced} autoRotateSpeed={0.5} />
      <EffectComposer><Bloom intensity={0.8} luminanceThreshold={0.3} mipmapBlur /></EffectComposer>
    </Canvas>
  );
}
