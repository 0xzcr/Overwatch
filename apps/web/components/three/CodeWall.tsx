"use client";
import { useEffect, useRef } from "react";

/**
 * A quiet wall of real decoded onchain facts, scrolling like a pager in a terminal.
 * Lines matching /CRITICAL|RED|single key|no delay/ are highlighted in the accent color.
 */
export function CodeWall({ lines, className = "" }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, w = 0, h = 0, dpr = 1, offset = 0, last = performance.now();
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--chrome").trim() || "#a9a49a";
    const dim = css.getPropertyValue("--dim").trim() || "#6d6b66";
    const acc = css.getPropertyValue("--accent").trim() || "#ffb547";
    const bad = css.getPropertyValue("--bad").trim() || "#ff5d4f";
    const LH = 15;
    const src = lines.length ? lines : ["// waiting for the indexer…"];
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `11px ${css.getPropertyValue("--font-plex") || "monospace"}, ui-monospace, monospace`;
    };
    const draw = (t: number) => {
      const dt = Math.min(64, t - last); last = t;
      if (!reduced) offset += dt * 0.012;
      ctx.clearRect(0, 0, w, h);
      const first = Math.floor(offset / LH);
      const rows = Math.ceil(h / LH) + 2;
      for (let i = 0; i < rows; i++) {
        const n = first + i;
        const line = src[n % src.length]!;
        const y = i * LH - (offset % LH) + 12;
        const fade = Math.min(1, y / 120, (h - y) / 160);
        ctx.globalAlpha = Math.max(0, fade) * 0.85;
        ctx.fillStyle = dim;
        ctx.fillText(String((n % 9999) + 1).padStart(4, " "), 10, y);
        const hot = /CRITICAL|single key|SINGLE_KEY|no delay|RED\b/.test(line);
        const warm = /timelock|nonce|threshold/i.test(line);
        ctx.fillStyle = hot ? bad : warm ? acc : ink;
        ctx.globalAlpha *= hot || warm ? 1 : 0.55;
        ctx.fillText(line, 52, y);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [lines]);
  return <canvas ref={ref} className={`w-full h-full block ${className}`} aria-hidden />;
}
