"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export interface SceneStep { date: string; headline: string; level: "ok" | "warn" | "bad" | "dead" }
const COLOR = { ok: "#7fd18b", warn: "#ffb547", bad: "#ff5d4f", dead: "#ff2a1a" };
const X = (i: number) => i * 3.2;

function Monolith({ s, i, active }: { s: SceneStep; i: number; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const h = s.level === "dead" ? 3.4 : s.level === "bad" ? 2.6 : s.level === "warn" ? 2 : 1.4;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = active ? 0.55 + Math.sin(clock.elapsedTime * 4) * 0.15 : 0.18;
  });
  return (
    <group position={[X(i), 0, 0]}>
      <mesh ref={ref} position={[0, h / 2, 0]}><boxGeometry args={[0.5, h, 0.5]} /><meshBasicMaterial color={COLOR[s.level]} transparent opacity={0.2} toneMapped={false} /></mesh>
      <lineSegments position={[0, h / 2, 0]}><edgesGeometry args={[new THREE.BoxGeometry(0.5, h, 0.5)]} /><lineBasicMaterial color={COLOR[s.level]} /></lineSegments>
      <Html position={[0, -0.45, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
        <div className="mono text-center whitespace-nowrap"><div className="text-[12px]" style={{ color: COLOR[s.level] }}>{s.date.slice(5, 10)}</div><div className="text-[10px] text-[#a9a49a]">{s.headline}</div></div>
      </Html>
    </group>
  );
}

function Cam({ step }: { step: number }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ pointer }) => {
    target.set(X(step) + 1.6 + pointer.x * 0.6, 3.2 + pointer.y * 0.4, 9.5);
    camera.position.lerp(target, 0.05);
    camera.lookAt(X(step), 1, 0);
  });
  return null;
}

function Particles() {
  const geo = useMemo(() => {
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([Math.random() * 18 - 2, Math.random() * 6, Math.random() * 8 - 6], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); return g;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.01; });
  return <points ref={ref} geometry={geo}><pointsMaterial size={0.02} color="#6d6b66" transparent opacity={0.6} /></points>;
}

export default function DriftScene({ steps, step }: { steps: SceneStep[]; step: number }) {
  const rail = useMemo(() => [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(X(steps.length - 1) + 1, 0, 0)], [steps.length]);
  return (
    <Canvas camera={{ position: [2, 3.2, 9.5], fov: 42 }} dpr={[1, 1.8]} gl={{ alpha: true }}>
      <Cam step={step} />
      <Particles />
      <Line points={rail} color="#6d6b66" lineWidth={1} />
      <Line points={[rail[0]!, new THREE.Vector3(X(step), 0, 0)]} color="#ffb547" lineWidth={2} />
      {steps.map((s, i) => <Monolith key={s.date} s={s} i={i} active={i === step} />)}
      <gridHelper args={[40, 40, "#1a1917", "#111110"]} position={[8, -0.01, 0]} />
      <EffectComposer><Bloom intensity={1.1} luminanceThreshold={0.2} mipmapBlur /><Noise opacity={0.04} /></EffectComposer>
    </Canvas>
  );
}
