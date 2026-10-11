"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

export interface GlobeNode { slug: string; name: string; grade: string | null; red: boolean; tvl: number | null; flags: string[] }

const GRADE_HEX: Record<string, string> = { A: "#7fd18b", B: "#a5d98a", C: "#ffb547", D: "#ff7a4f", F: "#ff5d4f" };

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; }
function nodePos(slug: string, r: number) {
  const u = hash(slug), v = hash(slug + "#");
  const theta = u * Math.PI * 2, phi = Math.acos(1.6 * v - 0.8);
  return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function Dots({ count = 5200, r = 2 }) {
  const geo = useMemo(() => {
    const p = new Float32Array(count * 3);
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2, rad = Math.sqrt(1 - y * y), t = g * i;
      p.set([Math.cos(t) * rad * r, y * r, Math.sin(t) * rad * r], i * 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return geom;
  }, [count, r]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.012} color="#a9a49a" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** Rotating radar sweep: a translucent wedge with a bright leading edge, drawn with a tiny shader. */
function Sweep({ r = 3.4 }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uAngle!.value = (mat.current.uniforms.uAngle!.value + dt * 0.9) % (Math.PI * 2); });
  const uniforms = useMemo(() => ({ uAngle: { value: 0 }, uColor: { value: new THREE.Color("#ffb547") } }), []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
      <ringGeometry args={[2.08, r, 128, 1]} />
      <shaderMaterial ref={mat} transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms}
        vertexShader={`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`}
        fragmentShader={`uniform float uAngle; uniform vec3 uColor; varying vec2 vP;
          void main(){ float a = atan(vP.y, vP.x); float d = mod(uAngle - a + 6.28318, 6.28318);
            float trail = smoothstep(1.4, 0.0, d) * 0.22; float edge = smoothstep(0.035, 0.0, d) * 0.9;
            float r = length(vP); float rings = smoothstep(0.012, 0.0, abs(fract(r*1.6)-0.5)-0.49) * 0.12;
            float fade = smoothstep(3.4, 2.2, r) * smoothstep(2.08, 2.3, r);
            gl_FragColor = vec4(uColor, (trail + edge + rings) * fade); }`} />
    </mesh>
  );
}

function OrbitRing({ r, tilt, speed, dash = false }: { r: number; tilt: number; speed: number; dash?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * speed; });
  const pts = useMemo(() => Array.from({ length: 181 }, (_, i) => { const t = (i / 180) * Math.PI * 2; return new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r); }), [r]);
  return (
    <group ref={ref} rotation-x={tilt}>
      <Line points={pts} color="#6d6b66" lineWidth={0.6} transparent opacity={0.45} dashed={dash} dashSize={0.06} gapSize={0.08} />
      {Array.from({ length: 24 }, (_, i) => { const t = (i / 24) * Math.PI * 2; return <mesh key={i} position={[Math.cos(t) * r, 0, Math.sin(t) * r]}><boxGeometry args={[0.012, 0.012, i % 6 === 0 ? 0.12 : 0.04]} /><meshBasicMaterial color="#a9a49a" /></mesh>; })}
    </group>
  );
}

function Node({ n, r }: { n: GlobeNode; r: number }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const pos = useMemo(() => nodePos(n.slug, r), [n.slug, r]);
  const color = n.grade ? GRADE_HEX[n.grade]! : "#6d6b66";
  const size = 0.035 + Math.min(0.05, Math.log10(Math.max(1, n.tvl ?? 1e6)) / 220);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!halo.current) return;
    const t = clock.elapsedTime * (n.red ? 2.4 : 0.8) + hash(n.slug) * 6;
    const s = 1 + (n.red ? 1.6 : 0.5) * ((Math.sin(t) + 1) / 2);
    halo.current.scale.setScalar(s);
    (halo.current.material as THREE.MeshBasicMaterial).opacity = (n.red ? 0.35 : 0.08) * (1.2 - (s - 1) / 1.6);
  });
  return (
    <group position={pos}>
      <Line points={[[0, 0, 0], pos.clone().normalize().multiplyScalar(0.35).toArray()]} color={color} lineWidth={1} transparent opacity={0.6} />
      <mesh onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }} onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }} onClick={() => router.push(`/protocols/${n.slug}`)}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={halo}><sphereGeometry args={[size * 1.9, 16, 16]} /><meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} toneMapped={false} /></mesh>
      {(hover || n.red) && (
        <Html distanceFactor={7} position={[0, size + 0.08, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="mono whitespace-nowrap text-[10px] px-1.5 py-0.5 border" style={{ color, borderColor: color, background: "rgba(5,5,5,.75)" }}>
            {n.name} · {n.grade ?? "?"}{n.red ? " · RED" : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * 0.06;
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, 0.25 + pointer.y * 0.15, 0.04);
    g.current.rotation.z = THREE.MathUtils.lerp(g.current.rotation.z, -pointer.x * 0.08, 0.04);
  });
  return <group ref={g}>{children}</group>;
}

export default function RadarGlobe({ nodes, reduced = false }: { nodes: GlobeNode[]; reduced?: boolean }) {
  const R = 2;
  return (
    <Canvas camera={{ position: [0, 1.1, 6.4], fov: 42 }} dpr={[1, 1.8]} frameloop={reduced ? "demand" : "always"} gl={{ antialias: true, alpha: true }}>
      <Rig>
        <Dots r={R} />
        <mesh><sphereGeometry args={[R * 0.985, 64, 64]} /><meshBasicMaterial color="#050505" transparent opacity={0.85} /></mesh>
        <Sweep />
        <OrbitRing r={2.6} tilt={0.18} speed={0.05} />
        <OrbitRing r={3.05} tilt={-0.32} speed={-0.03} dash />
        {nodes.map((n) => <Node key={n.slug} n={n} r={R} />)}
      </Rig>
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.35} luminanceSmoothing={0.3} mipmapBlur />
        <Noise opacity={0.035} />
        <Vignette eskil={false} offset={0.2} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
