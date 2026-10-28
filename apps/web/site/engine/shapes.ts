// Procedural point-cloud targets for the stage. Every generator fills `count`
// xyz triples roughly inside a radius of ~2.6 units so camera framing stays constant.

import { mulberry, type Rand } from "./rand";

type V3 = [number, number, number];
const TAU = Math.PI * 2;

const gauss = (r: Rand) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r());
const pick = <T>(xs: readonly T[], r: Rand): T => xs[Math.floor(r() * xs.length)] as T;

function rotX(p: V3, a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const y = p[1] * c - p[2] * s;
  p[2] = p[1] * s + p[2] * c;
  p[1] = y;
}
function rotY(p: V3, a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const x = p[0] * c + p[2] * s;
  p[2] = -p[0] * s + p[2] * c;
  p[0] = x;
}
function rotZ(p: V3, a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  const x = p[0] * c - p[1] * s;
  p[1] = p[0] * s + p[1] * c;
  p[0] = x;
}

function spherePoint(r: Rand, rad: number): V3 {
  const u = r() * 2 - 1;
  const t = r() * TAU;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t) * rad, s * Math.sin(t) * rad, u * rad];
}

/** Classic 3D gradient noise, seeded. */
function makeNoise(seed: number) {
  const r = mulberry(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i] as number;
    p[i] = p[j] as number;
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255] as number;
  const P = (i: number) => perm[i] as number;
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return (g & 1 ? -u : u) + (g & 2 ? -v : v);
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255,
      Y = Math.floor(y) & 255,
      Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x),
      v = fade(y),
      w = fade(z);
    const A = P(X) + Y,
      AA = P(A) + Z,
      AB = P(A + 1) + Z;
    const B = P(X + 1) + Y,
      BA = P(B) + Z,
      BB = P(B + 1) + Z;
    return lerp(
      lerp(
        lerp(grad(P(AA), x, y, z), grad(P(BA), x - 1, y, z), u),
        lerp(grad(P(AB), x, y - 1, z), grad(P(BB), x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad(P(AA + 1), x, y, z - 1), grad(P(BA + 1), x - 1, y, z - 1), u),
        lerp(grad(P(AB + 1), x, y - 1, z - 1), grad(P(BB + 1), x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  };
}

function fill(count: number, fn: (f: number) => V3): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = fn(i / count);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

// --- Shapes -----------------------------------------------------------------

/** The Sentinel: an eye-like orb. Shell + iris cap facing +z + orbit rings. */
function orb(count: number, r: Rand) {
  return fill(count, (f) => {
    if (f < 0.5) {
      const p = spherePoint(r, 2.05);
      if (p[2] > 1.2 && r() < 0.75) {
        const q = spherePoint(r, 2.05);
        q[2] = -Math.abs(q[2]);
        return q;
      }
      return p;
    }
    if (f < 0.78) {
      const ring = Math.floor(r() * 9);
      const rad = 0.42 + ring * 0.075 + gauss(r) * 0.008;
      const a = r() * TAU;
      return [Math.cos(a) * rad, Math.sin(a) * rad, Math.sqrt(Math.max(0, 2.12 * 2.12 - rad * rad))];
    }
    if (f < 0.83) {
      const a = r() * TAU,
        rad = Math.sqrt(r()) * 0.16;
      return [Math.cos(a) * rad, Math.sin(a) * rad, 2.2];
    }
    const k = Math.floor(r() * 3);
    const rad = ([2.75, 3.05, 3.4][k] as number) + gauss(r) * 0.01;
    const a = r() * TAU;
    const p: V3 = [Math.cos(a) * rad, Math.sin(a) * rad, 0];
    rotX(p, [1.25, 1.45, 1.1][k] as number);
    rotY(p, [0.3, -0.5, 0.9][k] as number);
    return p;
  });
}

function radar(count: number, r: Rand) {
  const blips = Array.from({ length: 7 }, (_, i) => {
    const br = mulberry(i * 97 + 11);
    const a = br() * TAU,
      rad = 0.6 + br() * 2;
    return [Math.cos(a) * rad, Math.sin(a) * rad, 0.05 + br() * 0.06] as V3;
  });
  return fill(count, (f) => {
    let p: V3;
    if (f < 0.42) {
      const ring = 1 + Math.floor(r() * 6);
      const rad = ring * 0.46 + gauss(r) * 0.006;
      const a = r() * TAU;
      p = [Math.cos(a) * rad, Math.sin(a) * rad, 0];
    } else if (f < 0.52) {
      const t = (r() * 2 - 1) * 2.9;
      p = r() < 0.5 ? [t, gauss(r) * 0.005, 0] : [gauss(r) * 0.005, t, 0];
    } else if (f < 0.8) {
      const a = -Math.pow(r(), 2.4) * 1.3;
      const rad = Math.sqrt(r()) * 2.76;
      p = [Math.cos(a) * rad, Math.sin(a) * rad, 0];
    } else if (f < 0.9) {
      const b = pick(blips, r);
      p = [b[0] + gauss(r) * b[2], b[1] + gauss(r) * b[2], gauss(r) * b[2]];
    } else {
      p = spherePoint(r, 2.76);
      p[2] = Math.abs(p[2]) * 0.55;
    }
    rotX(p, -1.05);
    return p;
  });
}

function lattice(count: number, r: Rand) {
  const n = 4,
    size = 0.52,
    gap = 0.82;
  const off = ((n - 1) * gap) / 2;
  const E: [V3, V3][] = [
    [
      [-1, -1, -1],
      [1, -1, -1],
    ],
    [
      [-1, 1, -1],
      [1, 1, -1],
    ],
    [
      [-1, -1, 1],
      [1, -1, 1],
    ],
    [
      [-1, 1, 1],
      [1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [-1, 1, -1],
    ],
    [
      [1, -1, -1],
      [1, 1, -1],
    ],
    [
      [-1, -1, 1],
      [-1, 1, 1],
    ],
    [
      [1, -1, 1],
      [1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [-1, -1, 1],
    ],
    [
      [1, -1, -1],
      [1, -1, 1],
    ],
    [
      [-1, 1, -1],
      [-1, 1, 1],
    ],
    [
      [1, 1, -1],
      [1, 1, 1],
    ],
  ];
  return fill(count, () => {
    const c: V3 = [Math.floor(r() * n) * gap - off, Math.floor(r() * n) * gap - off, Math.floor(r() * n) * gap - off];
    const [a, b] = pick(E, r);
    const t = r(),
      h = size / 2;
    const p: V3 = [
      c[0] + (a[0] + (b[0] - a[0]) * t) * h,
      c[1] + (a[1] + (b[1] - a[1]) * t) * h,
      c[2] + (a[2] + (b[2] - a[2]) * t) * h,
    ];
    rotY(p, 0.65);
    rotX(p, 0.45);
    return p;
  });
}

const SHIELD_TOP = 2.1,
  SHIELD_W = 1.75,
  SHIELD_H = 4.6;
function shieldHalfWidth(y: number) {
  const k = (SHIELD_TOP - y) / SHIELD_H;
  return SHIELD_W * Math.cos(Math.pow(k, 1.6) * (Math.PI / 2));
}
function shield(count: number, r: Rand) {
  return fill(count, (f) => {
    let x: number, y: number, z: number;
    if (f < 0.3) {
      const t = r();
      if (t < 0.18) {
        const k = t / 0.18;
        x = -SHIELD_W + 2 * SHIELD_W * k;
        y = SHIELD_TOP - Math.sin(k * Math.PI) * 0.18;
      } else {
        y = SHIELD_TOP - r() * SHIELD_H;
        x = shieldHalfWidth(y) * (r() < 0.5 ? -1 : 1);
      }
      const inset = r() < 0.55 ? 1 : 0.86;
      x *= inset;
      y = y * inset + (1 - inset) * -0.15;
      z = gauss(r) * 0.02;
    } else if (f < 0.42) {
      const t = r();
      if (t < 0.38) {
        const k = t / 0.38;
        x = -0.75 + k * 0.6;
        y = 0.05 - k * 0.6;
      } else {
        const k = (t - 0.38) / 0.62;
        x = -0.15 + k * 1.05;
        y = -0.55 + k * 1.15;
      }
      x += gauss(r) * 0.03;
      y += gauss(r) * 0.03;
      z = 0.34 + gauss(r) * 0.02;
    } else {
      do {
        x = (r() * 2 - 1) * SHIELD_W;
        y = SHIELD_TOP - r() * SHIELD_H;
      } while (Math.abs(x) > shieldHalfWidth(y));
      z = (1 - (x * x) / 3.2) * 0.3 * (r() < 0.5 ? 1 : -1);
    }
    return [x, y + 0.25, z];
  });
}

function burst(count: number, r: Rand) {
  const sr = mulberry(77);
  const dirs = Array.from(
    { length: 90 },
    () => [...spherePoint(sr, 1), 1.2 + sr() * 1.7] as [number, number, number, number],
  );
  return fill(count, (f) => {
    if (f < 0.62) {
      const d = pick(dirs, r);
      const t = Math.pow(r(), 0.7) * d[3];
      const j = 0.02 + t * 0.012;
      return [d[0] * t + gauss(r) * j, d[1] * t + gauss(r) * j, d[2] * t + gauss(r) * j];
    }
    if (f < 0.8) return spherePoint(r, 0.55 * Math.cbrt(r()));
    const a = r() * TAU,
      rad = 2.6 + gauss(r) * 0.05;
    const p: V3 = [Math.cos(a) * rad, Math.sin(a) * rad, gauss(r) * 0.04];
    rotX(p, 1.2);
    rotZ(p, 0.4);
    return p;
  });
}

/** Control graph: program → authority → multisig → signers → nonces, as a layered constellation. */
function graph(count: number, r: Rand) {
  const gr = mulberry(9);
  type N = { p: V3; s: number };
  const layers: N[][] = [];
  const counts = [1, 1, 2, 7, 3];
  counts.forEach((c, li) => {
    const x = -2.6 + li * 1.3;
    layers.push(
      Array.from({ length: c }, (_, i) => {
        const a = (i / c) * TAU + gr() * 0.4;
        const rad = c === 1 ? 0 : 0.5 + c * 0.17;
        return { p: [x, Math.cos(a) * rad, Math.sin(a) * rad] as V3, s: li === 0 ? 0.24 : 0.07 + gr() * 0.06 };
      }),
    );
  });
  const nodes = layers.flat();
  const links: [N, N][] = [];
  for (let li = 0; li < layers.length - 1; li++) {
    const A = layers[li] as N[],
      B = layers[li + 1] as N[];
    B.forEach((b, i) => links.push([A[i % A.length] as N, b]));
    if (li >= 2) B.forEach((b) => links.push([pick(A, gr), b]));
  }
  return fill(count, (f) => {
    if (f < 0.4) {
      const n = pick(nodes, r);
      return [n.p[0] + gauss(r) * n.s, n.p[1] + gauss(r) * n.s, n.p[2] + gauss(r) * n.s];
    }
    if (f < 0.92) {
      const [a, b] = pick(links, r);
      const t = r();
      // gentle arc between layers
      const bow = Math.sin(t * Math.PI) * 0.18;
      return [
        a.p[0] + (b.p[0] - a.p[0]) * t,
        a.p[1] + (b.p[1] - a.p[1]) * t + bow,
        a.p[2] + (b.p[2] - a.p[2]) * t + gauss(r) * 0.006,
      ];
    }
    const p = spherePoint(r, 3 + r() * 0.3);
    p[0] *= 1.1;
    p[2] *= 0.4;
    return p;
  });
}

function lock(count: number, r: Rand) {
  const bw = 1.55,
    bh = 1.25,
    bd = 0.42,
    by = -0.75;
  return fill(count, (f) => {
    if (f < 0.55) {
      const face = r();
      let x: number, y: number, z: number;
      if (face < 0.55) {
        x = (r() * 2 - 1) * bw;
        y = by + (r() * 2 - 1) * bh;
        z = bd;
        const ky = y - by - 0.15;
        if (Math.hypot(x, ky) < 0.22 || (Math.abs(x) < 0.09 && ky < 0 && ky > -0.62)) z = bd - 0.25;
      } else if (face < 0.7) {
        x = (r() * 2 - 1) * bw;
        y = by + (r() * 2 - 1) * bh;
        z = -bd;
      } else if (face < 0.85) {
        x = (r() < 0.5 ? -1 : 1) * bw;
        y = by + (r() * 2 - 1) * bh;
        z = (r() * 2 - 1) * bd;
      } else {
        x = (r() * 2 - 1) * bw;
        y = by + (r() < 0.5 ? -1 : 1) * bh;
        z = (r() * 2 - 1) * bd;
      }
      return [x, y, z];
    }
    if (f < 0.92) {
      const R = 1.0,
        tube = 0.19;
      const a = r() * TAU;
      if (r() < 0.7) {
        const t = r() * Math.PI;
        const cx = Math.cos(t) * R,
          cy = by + bh + 0.65 + Math.sin(t) * R;
        return [cx + Math.cos(a) * Math.cos(t) * tube, cy + Math.cos(a) * Math.sin(t) * tube, Math.sin(a) * tube];
      }
      const cx = r() < 0.5 ? -R : R;
      return [cx + Math.cos(a) * tube, by + bh + r() * 0.65, Math.sin(a) * tube];
    }
    const p = spherePoint(r, 2.6 + r() * 0.4);
    p[2] *= 0.3;
    return p;
  });
}

function knot(count: number, r: Rand) {
  const P = 2,
    Q = 3;
  const curve = (t: number): V3 => {
    const rr = Math.cos(Q * t) + 2.1;
    return [rr * Math.cos(P * t), rr * Math.sin(P * t), -Math.sin(Q * t)];
  };
  return fill(count, (f) => {
    const t = r() * TAU;
    const c = curve(t),
      c2 = curve(t + 0.01);
    const T: V3 = [c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]];
    const tl = Math.hypot(...T);
    T[0] /= tl;
    T[1] /= tl;
    T[2] /= tl;
    const nl = Math.hypot(T[1], T[0]) || 1;
    const N: V3 = [-T[1] / nl, T[0] / nl, 0];
    const B: V3 = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const a = r() * TAU;
    const tube = f < 0.75 ? 0.32 : 0.32 + Math.abs(gauss(r)) * 0.25;
    const s = 0.78;
    return [
      (c[0] + (N[0] * Math.cos(a) + B[0] * Math.sin(a)) * tube) * s,
      (c[1] + (N[1] * Math.cos(a) + B[1] * Math.sin(a)) * tube) * s,
      (c[2] + (N[2] * Math.cos(a) + B[2] * Math.sin(a)) * tube) * s,
    ];
  });
}

function terrain(count: number, r: Rand) {
  const noise = makeNoise(21);
  const lines = 46;
  return fill(count, () => {
    let x: number, z: number;
    if (r() < 0.5) {
      x = (r() * 2 - 1) * 3.4;
      z = (Math.floor(r() * lines) / (lines - 1)) * 6.8 - 3.4;
    } else {
      z = (r() * 2 - 1) * 3.4;
      x = (Math.floor(r() * lines) / (lines - 1)) * 6.8 - 3.4;
    }
    const d = Math.hypot(x, z);
    const y = noise(x * 0.45, z * 0.45, 0.3) * 1.3 + Math.exp(-d * d * 0.35) * 1.1 - 0.6;
    const p: V3 = [x, y, z];
    rotX(p, 0.42);
    return p;
  });
}

export function globeLand() {
  const noise = makeNoise(4);
  return (x: number, y: number, z: number) => {
    const s = 0.9;
    return noise(x * s, y * s, z * s) + noise(x * s * 2.1, y * s * 2.1, z * s * 2.1) * 0.45;
  };
}
export const GLOBE_R = 2.25;

function globe(count: number, r: Rand) {
  const land = globeLand();
  return fill(count, (f) => {
    if (f < 0.12) return spherePoint(r, GLOBE_R * (1.05 + Math.abs(gauss(r)) * 0.05));
    for (let tries = 0; tries < 40; tries++) {
      const u = spherePoint(r, 1);
      if (land(u[0], u[1], u[2]) > 0.12) return [u[0] * GLOBE_R, u[1] * GLOBE_R, u[2] * GLOBE_R];
    }
    const lat = (Math.floor(r() * 36) / 36) * Math.PI - Math.PI / 2;
    const lon = r() * TAU;
    return [Math.cos(lat) * Math.cos(lon) * GLOBE_R, Math.sin(lat) * GLOBE_R, Math.cos(lat) * Math.sin(lon) * GLOBE_R];
  });
}

function wordmark(count: number, r: Rand) {
  const W = 1400,
    H = 260;
  const pts: [number, number][] = [];
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fff";
    ctx.font = '700 220px "IBM Plex Sans Variable", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OVERWATCH", W / 2, H / 2 + 8);
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2) if ((data[(y * W + x) * 4 + 3] ?? 0) > 128) pts.push([x, y]);
  }
  const scale = 7.6 / W;
  return fill(count, (f) => {
    if (f < 0.9 && pts.length) {
      const [x, y] = pick(pts, r);
      return [(x + r() * 2 - W / 2) * scale, -(y + r() * 2 - H / 2) * scale, gauss(r) * 0.04];
    }
    const a = r() * TAU;
    return [Math.cos(a) * (4.2 + r() * 0.5), gauss(r) * 0.6, Math.sin(a) * 1.4];
  });
}

function scatter(count: number, r: Rand) {
  return fill(count, () => {
    const p = spherePoint(r, 3 + Math.pow(r(), 0.5) * 5);
    p[2] *= 0.6;
    return p;
  });
}

export const SHAPES = {
  orb,
  radar,
  lattice,
  shield,
  burst,
  graph,
  lock,
  knot,
  terrain,
  globe,
  wordmark,
  scatter,
} as const;
export type ShapeName = keyof typeof SHAPES;
export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/**
 * One shape's particle positions. The seed depends only on the shape's slot, so a shape comes out
 * identical no matter when it is built.
 */
export function buildShape(slot: number, count: number): Float32Array {
  const name = SHAPE_NAMES[slot] as ShapeName;
  return SHAPES[name](count, mulberry(1000 + slot * 31));
}
