"use client";
import { useEffect, useRef } from "react";

/**
 * The landing hero's eye, drawn in monospaced text: a rotating sphere of onchain-looking strings (slots, program ids,
 * hex) with a red iris that follows the pointer, blinks, and labels its own gaze. Canvas 2D; pauses offscreen; one
 * still frame for reduced motion. The readout's slot is the real mainnet slot from /api/v1/status, estimated forward.
 */

const TOKENS = [
  "dRiftyHA39MW",
  "SQDS4ep65T86",
  "KLend2g3cP87",
  "MFv2hWf31Z9k",
  "whirLbMiicVd",
  "JUP6LkbZbjS1",
  "BPFLoaderUpgradeab1e",
  "458481971",
  "2390523523",
  "0xC11",
  "0x7f3a9c",
  "0x0000",
  "RED_MASK",
  "threshold:4/7",
  "timelock:86400",
  "nonce",
  "upgrade_authority",
  "check_and_exit",
  "risk",
  "PDA",
  "slot",
  "flags",
  "signers",
  "grade:A",
  "85/100",
  "0b1101",
];
const SEPS = [" ", " · ", ":", "/", "  ", "::", " "];
const SLOT_MS = 400;

function textStream(n: number) {
  let s = 0x9e3779b9;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  let out = "";
  while (out.length < n) out += TOKENS[Math.floor(rand() * TOKENS.length)]! + SEPS[Math.floor(rand() * SEPS.length)]!;
  return out;
}

export function AsciiEye() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const color = {
      red: css.getPropertyValue("--mint").trim() || "#ff1f3d",
      ink: css.getPropertyValue("--ink").trim() || "#f7efef",
      dim: css.getPropertyValue("--chrome").trim() || "#b8a3a3",
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const text = textStream(12000);
    const glitch = "0123456789abcdef";

    let W = 0,
      H = 0,
      fs = 11,
      cw = 6.6,
      lh = 13;
    let raf = 0,
      visible = true,
      t0 = performance.now();
    const gaze = { x: 0, y: 0 }; // where the pupil points, in sphere units
    const target = { x: 0.18, y: -0.08 };
    let pointer: { x: number; y: number } | null = null; // canvas pixels
    let lastMove = 0,
      nextBlink = 2500,
      slot: { n: number; at: number } | null = null;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fs = W < 420 ? 9 : 11;
      ctx.font = `${fs}px "IBM Plex Mono", ui-monospace, monospace`;
      cw = ctx.measureText("0").width;
      lh = Math.round(fs * 1.2);
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // gaze: the pointer when it moved recently, otherwise a slow wander
      if (pointer && now - lastMove < 4000) {
        const r = Math.min(W, H) * 0.38;
        const dx = (pointer.x - W * 0.46) / (r * 2.2),
          dy = (pointer.y - H * 0.46) / (r * 2.2);
        const len = Math.hypot(dx, dy),
          max = 0.55;
        target.x = len > max ? (dx / len) * max : dx;
        target.y = len > max ? (dy / len) * max : dy;
      } else if (!still) {
        target.x = Math.sin(t * 0.31) * 0.32;
        target.y = Math.sin(t * 0.23 + 1) * 0.18;
      }
      const ease = still ? 1 : 0.08;
      gaze.x += (target.x - gaze.x) * ease;
      gaze.y += (target.y - gaze.y) * ease;
      const gz = Math.sqrt(Math.max(0, 1 - gaze.x * gaze.x - gaze.y * gaze.y));

      // blink: the lids close to a slit and reopen over ~220 ms
      let lid = 1;
      if (!still && now > nextBlink) {
        const p = (now - nextBlink) / 220;
        if (p >= 1) nextBlink = now + 4000 + Math.random() * 5000;
        else lid = 1 - Math.sin(p * Math.PI) * 0.97;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.font = `${fs}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      const R = Math.min(W, H) * 0.38;
      const cx = W * 0.46,
        cy = H * 0.46;
      const spin = still ? 0 : t * 0.12;
      const bucket = Math.floor(t * 8);
      const cols = Math.ceil((2 * R) / cw) + 1,
        rows = Math.ceil((2 * R) / lh) + 1;
      // characters around the equator: one per cell at the centre, so letters never repeat; the limb compresses them
      const around = Math.round((2 * Math.PI * R) / cw);
      const x0 = cx - (cols * cw) / 2,
        y0 = cy - (rows * lh) / 2;

      for (let row = 0; row < rows; row++) {
        const y = y0 + (row + 0.5) * lh;
        const ny = (y - cy) / R;
        if (Math.abs(ny) >= 1 || Math.abs(ny) > lid) continue;
        const lat = Math.asin(ny);
        const band = Math.floor(((lat + Math.PI / 2) / Math.PI) * 48);
        for (let col = 0; col < cols; col++) {
          const x = x0 + (col + 0.5) * cw;
          const nx = (x - cx) / R;
          const r2 = nx * nx + ny * ny;
          if (r2 >= 1) continue;
          const nz = Math.sqrt(1 - r2);
          const look = nx * gaze.x + ny * gaze.y + nz * gz;
          if (look > 0.985) continue; // pupil: empty

          const lon = Math.atan2(nx, nz) + spin;
          let i = band * 211 + Math.floor((lon / (Math.PI * 2)) * around);
          i = ((i % text.length) + text.length) % text.length;
          let ch = text[i]!;
          const h = ((row * 73856093) ^ (col * 19349663) ^ (bucket * 83492791)) >>> 0;
          if (!still && h % 97 === 0) ch = glitch[h % 16]!;
          if (ch === " ") continue;

          const light = Math.max(0, nx * -0.35 + ny * -0.45 + nz * 0.82);
          if (look > 0.86) {
            // iris: red, brightest at its inner edge
            const ring = (look - 0.86) / (0.985 - 0.86);
            ctx.fillStyle = color.red;
            ctx.globalAlpha = 0.45 + 0.55 * ring;
          } else {
            ctx.fillStyle = look > 0.8 ? color.ink : color.dim;
            ctx.globalAlpha = 0.12 + 0.62 * light * light;
          }
          ctx.fillText(ch, x - cw / 2, y);
        }
      }

      // tracking box around the pupil, a leader to the readout, and a dashed line to the pointer
      ctx.globalAlpha = 1;
      const px = cx + gaze.x * R,
        py = cy + gaze.y * R,
        s = R * 0.3;
      ctx.strokeStyle = color.ink;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(Math.round(px - s / 2) + 0.5, Math.round(py - s / 2) + 0.5, Math.round(s), Math.round(s));
      const lx = cx + R * 0.62,
        ly = cy + R * 1.12;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(px + s / 2, py + s / 2);
      ctx.lineTo(lx - 6, ly - lh);
      ctx.stroke();
      if (pointer && now - lastMove < 4000) {
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color.ink;
      const lines = [
        `gaze.x  ${gaze.x >= 0 ? "+" : ""}${gaze.x.toFixed(7)}`,
        `gaze.y  ${gaze.y >= 0 ? "+" : ""}${gaze.y.toFixed(7)}`,
      ];
      if (slot) lines.push(`slot  ≈${(slot.n + Math.floor((Date.now() - slot.at) / SLOT_MS)).toLocaleString("en-US")}`);
      lines.forEach((l, k) => ctx.fillText(l, lx, ly + k * lh));
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf && !still) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      lastMove = performance.now();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
    });
    const ro = new ResizeObserver(() => {
      resize();
      if (still) frame(performance.now());
    });
    const onVisibility = () => !document.hidden && start();

    void document.fonts.load(`11px "IBM Plex Mono"`).finally(() => {
      resize();
      t0 = performance.now();
      ro.observe(canvas);
      io.observe(canvas);
      if (still) frame(t0);
      else start();
    });
    fetch("/api/v1/status")
      .then((r) => r.json() as Promise<{ data?: { slot?: number | null } }>)
      .then((j) => j.data?.slot && (slot = { n: j.data.slot, at: Date.now() }))
      .catch(() => {});
    if (!still) addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="eye" aria-hidden="true" />;
}
