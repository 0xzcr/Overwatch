import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { gsap } from "gsap";
import { buildShapes, SHAPE_NAMES, globeLand, GLOBE_R, type ShapeName } from "./shapes";
import { mulberry } from "./rand";
import { tone } from "../nightfall";

const TEX_W = 256;

const particleVert = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  uniform sampler2D uShapes;
  uniform float uRows;
  uniform float uFrom;
  uniform float uTo;
  uniform float uMix;
  uniform float uTurb;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uPointerForce;
  uniform float uScan;
  uniform float uJitter;
  attribute float aIdx;
  attribute vec4 aRand;
  varying float vAlpha;
  varying float vHot;
  varying float vDepth;

  vec3 fetchShape(float shape) {
    int i = int(aIdx);
    ivec2 uv = ivec2(i % ${TEX_W}, int(shape * uRows) + i / ${TEX_W});
    return texelFetch(uShapes, uv, 0).xyz;
  }

  vec3 swirl(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t * 0.9 + aRand.x * 6.28) + sin(p.z * 2.3 - t * 0.7),
      sin(p.z * 1.9 + t * 0.8 + aRand.y * 6.28) + sin(p.x * 2.1 + t * 0.6),
      sin(p.x * 1.5 - t * 1.1 + aRand.z * 6.28) + sin(p.y * 2.7 + t * 0.5)
    );
  }

  void main() {
    vec3 a = fetchShape(uFrom);
    vec3 b = fetchShape(uTo);
    float delay = aRand.w * 0.35;
    float m = clamp((uMix - delay) / 0.65, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    vec3 p = mix(a, b, m);

    float idle = 0.018 + aRand.x * 0.02;
    p += vec3(
      sin(uTime * (0.6 + aRand.y) + aRand.z * 40.0),
      cos(uTime * (0.5 + aRand.x) + aRand.w * 40.0),
      sin(uTime * (0.7 + aRand.w) + aRand.y * 40.0)
    ) * idle;
    p += swirl(p, uTime) * uTurb * (0.25 + aRand.x * 0.9);
    // nervous jitter for "alarm" states
    p += (vec3(aRand.y, aRand.z, aRand.x) - 0.5) * uJitter * sin(uTime * 40.0 + aRand.w * 100.0);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec3 d = world.xyz - uPointer;
    float dist = length(d.xy);
    float push = smoothstep(1.4, 0.0, dist) * uPointerForce;
    world.xy += normalize(d.xy + 0.0001) * push * 0.55;
    world.z += push * 0.6;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    float size = uSize * (0.55 + aRand.y * aRand.y * 1.6);
    gl_PointSize = size * uPixelRatio * (9.0 / -mv.z);

    float scan = smoothstep(0.22, 0.0, abs(world.y - uScan));
    vHot = scan + push * 1.4 + step(0.985, aRand.z) * (0.6 + 0.4 * sin(uTime * 3.0 + aRand.x * 20.0));
    vAlpha = 0.55 + aRand.x * 0.45;
    vDepth = clamp((-mv.z - 6.0) / 8.0, 0.0, 1.0);
  }
`;

const particleFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vHot;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = pow(smoothstep(0.5, 0.0, d), 1.8);
    vec3 col = mix(uColorA, uColorB, vDepth);
    col = mix(col, vec3(1.0), clamp(vHot, 0.0, 1.0) * 0.75);
    float a = core * vAlpha * uOpacity * (1.0 - vDepth * 0.55) * (1.0 + vHot * 1.5);
    gl_FragColor = vec4(col * a, a);
  }
`;

const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uScroll * (0.6 + aSeed) + 12.0, 24.0) - 12.0;
    p.x += sin(uTime * 0.1 + aSeed * 30.0) * 0.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 + aSeed * 2.0) * uPixelRatio;
    vA = 0.15 + 0.35 * aSeed * (0.6 + 0.4 * sin(uTime * (0.5 + aSeed) + aSeed * 50.0));
  }
`;
const dustFrag = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.7, 0.85, 1.0) * vA, vA);
  }
`;

const arcVert = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const arcFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOffset;
  uniform float uSpeed;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vT;
  void main() {
    float head = fract(uTime * uSpeed + uOffset) * 1.6 - 0.3;
    float trail = smoothstep(head - 0.35, head, vT) * step(vT, head);
    float a = (0.08 + trail) * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), trail * 0.6) * a, a);
  }
`;

// Every colour goes through tone(), so the night palette reaches the particles too.
const toVec3 = (hex: string) => {
  const c = new THREE.Color(tone(hex));
  return new THREE.Vector3(c.r, c.g, c.b);
};

export interface MorphOptions {
  colorA?: string;
  colorB?: string;
  x?: number;
  y?: number;
  yNarrow?: number;
  scale?: number;
  narrowScale?: number;
  autoRotate?: number;
  tiltX?: number;
  rotZ?: number;
  opacity?: number;
  duration?: number;
  arcs?: boolean;
  hud?: boolean;
  jitter?: number;
  /** Turn to face the camera and sway gently instead of spinning. */
  front?: boolean;
  sway?: number;
}

type U<T> = { value: T };

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private root = new THREE.Group();
  private spin = new THREE.Group();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private clock = new THREE.Clock();
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private pointerActive = false;
  private running = true;
  private fit = 1;
  private narrow = false;
  private scrollV = 0;
  private state = { autoRotate: 0.08, tiltX: 0, rotZ: 0, rotY: 0, sway: 0 };

  private count: number;
  private dpr: number;
  private rows = 0;
  private shapeData: Float32Array[] = [];
  private snapshotData: Float32Array | null = null;
  private snapshotSlot: number;
  private texData!: Float32Array;
  private shapeTex!: THREE.DataTexture;
  private points!: THREE.Points;
  private rand!: Float32Array;
  private morphTween: gsap.core.Tween | null = null;
  private turbTween: gsap.core.Timeline | null = null;

  private uniforms!: {
    uShapes: U<THREE.DataTexture>; uRows: U<number>; uFrom: U<number>; uTo: U<number>; uMix: U<number>; uTurb: U<number>;
    uTime: U<number>; uSize: U<number>; uPixelRatio: U<number>; uPointer: U<THREE.Vector3>; uPointerForce: U<number>;
    uScan: U<number>; uJitter: U<number>; uColorA: U<THREE.Vector3>; uColorB: U<THREE.Vector3>; uOpacity: U<number>;
  };
  private dustUniforms = { uTime: { value: 0 }, uScroll: { value: 0 }, uPixelRatio: { value: 1 } };
  private arcs = new THREE.Group();
  private arcMats: THREE.ShaderMaterial[] = [];
  private hud = new THREE.Group();
  private hudMats: (THREE.LineBasicMaterial | THREE.LineDashedMaterial)[] = [];
  private hudSpinA = new THREE.Group();
  private hudSpinB = new THREE.Group();
  private hudOpacity = { v: 0 };
  private reducedMotion: boolean;

  current: ShapeName = "orb";

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}) {
    this.reducedMotion = !!opts.reducedMotion;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const lowPower = small || (navigator.hardwareConcurrency || 8) <= 4;
    this.count = lowPower ? 18000 : 42000;
    this.dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75);
    this.snapshotSlot = SHAPE_NAMES.length;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 10);
    this.root.add(this.spin);
    this.scene.add(this.root);
    this.dustUniforms.uPixelRatio.value = this.dpr;

    this.buildParticles();
    this.buildDust();
    this.buildArcs();
    this.buildHud();
    if (!lowPower) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.05);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.pointerActive = e.pointerType === "mouse";
    });
    document.documentElement.addEventListener("pointerleave", () => (this.pointerActive = false));
    document.addEventListener("visibilitychange", () => (this.running = !document.hidden));
  }

  private buildParticles() {
    const N = this.count;
    const rows = Math.ceil(N / TEX_W);
    this.rows = rows;
    this.shapeData = buildShapes(N);
    const slots = SHAPE_NAMES.length + 1;
    const data = new Float32Array(TEX_W * rows * slots * 4);
    this.shapeData.forEach((arr, s) => {
      for (let i = 0; i < N; i++) {
        const o = (s * rows * TEX_W + i) * 4;
        data[o] = arr[i * 3] ?? 0;
        data[o + 1] = arr[i * 3 + 1] ?? 0;
        data[o + 2] = arr[i * 3 + 2] ?? 0;
        data[o + 3] = 1;
      }
    });
    this.texData = data;
    const tex = new THREE.DataTexture(data, TEX_W, rows * slots, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.shapeTex = tex;

    const geo = new THREE.BufferGeometry();
    const idx = new Float32Array(N);
    const rand = new Float32Array(N * 4);
    const r = mulberry(5);
    for (let i = 0; i < N; i++) {
      idx[i] = i;
      for (let k = 0; k < 4; k++) rand[i * 4 + k] = r();
    }
    this.rand = rand;
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("aIdx", new THREE.BufferAttribute(idx, 1));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    this.uniforms = {
      uShapes: { value: tex },
      uRows: { value: rows },
      uFrom: { value: SHAPE_NAMES.indexOf("scatter") },
      uTo: { value: SHAPE_NAMES.indexOf("scatter") },
      uMix: { value: 1 },
      uTurb: { value: 0.4 },
      uTime: { value: 0 },
      uSize: { value: this.count > 20000 ? 2.5 : 3 },
      uPixelRatio: { value: this.dpr },
      uPointer: { value: new THREE.Vector3(99, 99, 0) },
      uPointerForce: { value: 0 },
      uScan: { value: -10 },
      uJitter: { value: 0 },
      uColorA: { value: toVec3("#2BFFB0") },
      uColorB: { value: toVec3("#3a5cff") },
      uOpacity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.spin.add(this.points);
  }

  private buildDust() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = mulberry(42);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() * 2 - 1) * 16;
      pos[i * 3 + 1] = (r() * 2 - 1) * 12;
      pos[i * 3 + 2] = -4 - r() * 18;
      seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    this.scene.add(dust);
  }

  private buildArcs() {
    const land = globeLand();
    const r = mulberry(303);
    const pickLand = () => {
      for (let i = 0; i < 200; i++) {
        const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const p = new THREE.Vector3(s * Math.cos(t), s * Math.sin(t), u);
        if (land(p.x, p.y, p.z) > 0.2) return p;
      }
      return new THREE.Vector3(0, 1, 0);
    };
    const hubs = Array.from({ length: 5 }, pickLand);
    for (let i = 0; i < 26; i++) {
      const a = r() < 0.6 ? (hubs[Math.floor(r() * hubs.length)] as THREE.Vector3) : pickLand();
      const b = pickLand();
      if (a.angleTo(b) < 0.35) continue;
      const pts: THREE.Vector3[] = [];
      const segs = 64;
      const lift = 0.25 + a.angleTo(b) * 0.35;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        pts.push(a.clone().lerp(b, t).normalize().multiplyScalar(GLOBE_R * (1.01 + Math.sin(t * Math.PI) * lift)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(pts.map((_, k) => k / segs)), 1));
      const hex = r() < 0.35 ? "#FF5A3D" : "#2BFFB0";
      const mat = new THREE.ShaderMaterial({
        userData: { hex },
        uniforms: {
          uTime: { value: 0 },
          uOffset: { value: r() },
          uSpeed: { value: 0.18 + r() * 0.25 },
          uColor: { value: toVec3(hex) },
          uOpacity: { value: 0 },
        },
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.arcMats.push(mat);
      this.arcs.add(new THREE.Line(geo, mat));
    }
    this.arcs.visible = false;
    this.spin.add(this.arcs);
  }

  private buildHud() {
    const ring = (radius: number, dash: number, opacity: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const common = { color: 0x9fffe0, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false };
      const mat = dash ? new THREE.LineDashedMaterial({ ...common, dashSize: dash, gapSize: dash * 1.6 }) : new THREE.LineBasicMaterial(common);
      mat.userData.base = opacity;
      this.hudMats.push(mat);
      const line = new THREE.Line(geo, mat);
      if (dash) line.computeLineDistances();
      return line;
    };
    const ticks: THREE.Vector3[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const l = i % 6 === 0 ? 0.2 : 0.08;
      ticks.push(new THREE.Vector3(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0), new THREE.Vector3(Math.cos(a) * (4.2 + l), Math.sin(a) * (4.2 + l), 0));
    }
    const tickMat = new THREE.LineBasicMaterial({ color: 0x9fffe0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    tickMat.userData.base = 0.22;
    this.hudMats.push(tickMat);
    this.hudSpinA.add(ring(2.55, 0.05, 0.35));
    this.hudSpinB.add(ring(3.9, 0.3, 0.18), new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), tickMat));
    this.hud.add(this.hudSpinA, this.hudSpinB, ring(4.6, 0, 0.06));
    this.hud.position.z = -0.5;
    this.hud.visible = false;
    this.root.add(this.hud);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer && this.bloom) {
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
    }
    this.fit = Math.min(1, (w / h) * 1.15);
    this.narrow = w < 900;
  }

  /** Bake the current blended positions into the snapshot slot so an interrupted morph continues smoothly. */
  private snapshot() {
    const N = this.count;
    const u = this.uniforms;
    const from = u.uFrom.value === this.snapshotSlot ? this.snapshotData : this.shapeData[u.uFrom.value];
    const to = this.shapeData[u.uTo.value];
    if (!from || !to) return;
    const base = this.snapshotSlot * this.rows * TEX_W * 4;
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const delay = (this.rand[i * 4 + 3] ?? 0) * 0.35;
      let m = Math.min(1, Math.max(0, (u.uMix.value - delay) / 0.65));
      m = m * m * (3 - 2 * m);
      for (let k = 0; k < 3; k++) {
        const a = from[i * 3 + k] ?? 0;
        const v = a + ((to[i * 3 + k] ?? 0) - a) * m;
        out[i * 3 + k] = v;
        this.texData[base + i * 4 + k] = v;
      }
    }
    this.snapshotData = out;
    this.shapeTex.needsUpdate = true;
  }

  /** Re-applies the palette to colours set once at start-up (the globe arcs) after day/night flips. */
  retone() {
    for (const m of this.arcMats) (m.uniforms.uColor as U<THREE.Vector3>).value.copy(toVec3(m.userData.hex as string));
  }

  morph(name: ShapeName, opts: MorphOptions = {}) {
    const idx = SHAPE_NAMES.indexOf(name);
    if (idx < 0) return;
    const u = this.uniforms;
    const duration = this.reducedMotion ? 0.01 : (opts.duration ?? 2.2);

    if (u.uTo.value !== idx) {
      if (this.morphTween?.isActive()) {
        this.snapshot();
        u.uFrom.value = this.snapshotSlot;
      } else {
        u.uFrom.value = u.uTo.value;
      }
      u.uTo.value = idx;
      u.uMix.value = 0;
      this.morphTween?.kill();
      this.morphTween = gsap.to(u.uMix, { value: 1, duration, ease: "power2.inOut" });
      this.turbTween?.kill();
      this.turbTween = gsap
        .timeline()
        .to(u.uTurb, { value: 0.55, duration: duration * 0.35, ease: "power2.out" })
        .to(u.uTurb, { value: 0, duration: duration * 0.9, ease: "power2.inOut" });
    }
    this.current = name;

    if (opts.colorA) gsap.to(u.uColorA.value, { ...xyz(opts.colorA), duration: 1.4, ease: "power2.out" });
    if (opts.colorB) gsap.to(u.uColorB.value, { ...xyz(opts.colorB), duration: 1.4, ease: "power2.out" });

    const x = this.narrow ? 0 : (opts.x ?? 0);
    const y = this.narrow ? (opts.yNarrow ?? 0) : (opts.y ?? 0);
    const scale = (opts.scale ?? 1) * (this.narrow ? Math.max(0.62, this.fit) * (opts.narrowScale ?? 1) : 1);
    const d = Math.max(0.01, duration * 0.9);
    gsap.to(this.root.position, { x, y, duration: d, ease: "power3.inOut" });
    gsap.to(this.root.scale, { x: scale, y: scale, z: scale, duration: d, ease: "power3.inOut" });
    const st = this.state;
    if (opts.front) {
      const TAU = Math.PI * 2;
      gsap.to(st, { rotY: Math.round(st.rotY / TAU) * TAU, autoRotate: 0, duration: Math.max(0.01, duration * 0.9), ease: "power3.inOut" });
    } else {
      gsap.to(st, { autoRotate: opts.autoRotate ?? 0.08, duration: 1.5, ease: "power2.out" });
    }
    gsap.to(st, { tiltX: opts.tiltX ?? 0, rotZ: opts.rotZ ?? 0, sway: opts.sway ?? 0, duration: 1.5, ease: "power2.out" });
    gsap.to(u.uOpacity, { value: opts.opacity ?? 1, duration: 1.2 });
    gsap.to(u.uJitter, { value: opts.jitter ?? 0, duration: 0.6 });

    const wantArcs = !!opts.arcs;
    if (wantArcs) this.arcs.visible = true;
    this.arcMats.forEach((m) =>
      gsap.to(m.uniforms.uOpacity as U<number>, {
        value: wantArcs ? 1 : 0,
        duration: wantArcs ? 1.6 : 0.5,
        delay: wantArcs ? duration * 0.5 : 0,
        onComplete: () => {
          if (!wantArcs) this.arcs.visible = false;
        },
      }),
    );
    gsap.to(this.hudOpacity, { v: opts.hud ? 1 : 0, duration: 1.2 });
  }

  setScrollVelocity(v: number) {
    this.scrollV = v;
  }

  pulseScan() {
    if (this.reducedMotion) return;
    gsap.fromTo(this.uniforms.uScan, { value: 4 }, { value: -4, duration: 1.6, ease: "power1.inOut" });
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.running) this.frame();
    };
    loop();
  }

  private v3 = new THREE.Vector3();
  private perf = { frames: 0, time: 0, level: 0 };

  /** Step quality down on slow GPUs: first resolution, then bloom. */
  private adapt(rawDt: number) {
    const p = this.perf;
    if (p.level >= 2) return;
    p.frames++;
    p.time += rawDt;
    if (p.frames < 90) return;
    const fps = p.frames / p.time;
    p.frames = 0;
    p.time = 0;
    if (fps > 40) return;
    p.level++;
    if (p.level === 1) {
      this.dpr = 1;
      this.renderer.setPixelRatio(1);
      this.uniforms.uPixelRatio.value = 1;
      this.dustUniforms.uPixelRatio.value = 1;
      this.composer?.setPixelRatio(1);
      this.resize();
    } else {
      this.composer = null;
    }
  }

  private frame() {
    const raw = this.clock.getDelta();
    this.adapt(raw);
    const dt = Math.min(raw, 0.05);
    const t = this.clock.elapsedTime;
    const u = this.uniforms;
    u.uTime.value = t;
    this.dustUniforms.uTime.value = t;
    this.dustUniforms.uScroll.value += this.scrollV * 0.0006;
    for (const m of this.arcMats) (m.uniforms.uTime as U<number>).value = t;

    this.pointerSmooth.lerp(this.pointer, 1 - Math.pow(0.001, dt));
    const s = this.state;
    if (!this.reducedMotion) s.rotY += dt * s.autoRotate;
    const sway = this.reducedMotion ? 0 : Math.sin(t * 0.35) * s.sway;
    this.spin.rotation.set(s.tiltX - this.pointerSmooth.y * 0.32, s.rotY + sway + this.pointerSmooth.x * 0.45, s.rotZ);

    // pointer projected onto the z=0 plane
    const v = this.v3.set(this.pointerSmooth.x, this.pointerSmooth.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / v.z;
    u.uPointer.value.copy(this.camera.position).addScaledVector(v, dist);
    const force = this.pointerActive && !this.reducedMotion ? 1 : 0;
    u.uPointerForce.value += (force - u.uPointerForce.value) * Math.min(1, dt * 3);

    const ho = this.hudOpacity.v * u.uOpacity.value;
    this.hud.visible = ho > 0.01;
    if (this.hud.visible) {
      for (const m of this.hudMats) m.opacity = (m.userData.base as number) * ho;
      this.hudSpinA.rotation.z = -t * 0.15;
      this.hudSpinB.rotation.z = t * 0.05;
      this.hud.rotation.set(-this.pointerSmooth.y * 0.15, this.pointerSmooth.x * 0.2, 0);
    }

    this.camera.position.set(this.pointerSmooth.x * 0.15, this.pointerSmooth.y * 0.1, 10 + Math.min(Math.abs(this.scrollV) * 0.004, 0.8));
    this.camera.lookAt(0, 0, 0);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

function xyz(hex: string) {
  const v = toVec3(hex);
  return { x: v.x, y: v.y, z: v.z };
}
