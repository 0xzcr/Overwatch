"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCanRender3D } from "./three/useWebGL";
import { Sev } from "./ui/Grade";
import { Grade } from "./ui/Grade";
import type { SceneStep } from "./three/DriftScene";

const DriftScene = dynamic(() => import("./three/DriftScene"), { ssr: false });

export interface ReplayStep {
  date: string; headline: string; detail: string; level: SceneStep["level"];
  alerts: { severity: string; title: string; explanation: string; labels: string[] }[];
  score: number; grade: string; red: boolean; flags: string[];
}

const ATTACK = Date.parse("2026-04-01T16:05:00Z");

export function DriftReplay({ steps }: { steps: ReplayStep[] }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const { ready, webgl } = useCanRender3D();
  const s = steps[i]!;
  const firstAlert = steps.findIndex((x) => x.alerts.some((a) => a.severity !== "INFO"));
  const warningDays = firstAlert >= 0 ? (ATTACK - Date.parse(steps[firstAlert]!.date)) / 86_400_000 : 0;
  const daysLeft = Math.max(0, (ATTACK - Date.parse(s.date)) / 86_400_000);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => { if (i < steps.length - 1) setI(i + 1); else setAuto(false); }, 3800);
    return () => clearTimeout(t);
  }, [auto, i, steps.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "l") setI((x) => Math.min(steps.length - 1, x + 1)); if (e.key === "ArrowLeft" || e.key === "h") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [steps.length]);

  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-8">
      <div>
        <div className="relative h-[420px] sm:h-[520px] border hairline overflow-hidden">
          {ready && webgl ? <DriftScene steps={steps} step={i} /> : (
            <ol className="flex h-full items-end gap-3 p-6">{steps.map((x, j) => <li key={x.date} className="flex-1 border-t-4 pt-2 mono text-[10px]" style={{ borderColor: j <= i ? "var(--accent)" : "var(--line-2)" }}>{x.date.slice(5, 10)}</li>)}</ol>
          )}
          <div className="absolute top-4 left-4 panel px-4 py-3">
            <p className="label !text-[10px]">days of warning</p>
            <p className="mono text-4xl text-accent glow-accent">{i >= firstAlert && firstAlert >= 0 ? warningDays.toFixed(1) : "0.0"}</p>
            <p className="mono text-[10px] text-dim">{daysLeft > 0 ? `${daysLeft.toFixed(1)} days until the drain` : "drain in progress"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => setI(Math.max(0, i - 1))} className="mono text-xs border hairline px-3 h-9 hover:border-[var(--accent)]" aria-label="previous step">← h</button>
          <button onClick={() => setI(Math.min(steps.length - 1, i + 1))} className="mono text-xs border hairline px-3 h-9 hover:border-[var(--accent)]" aria-label="next step">l →</button>
          <button onClick={() => { if (i === steps.length - 1) setI(0); setAuto((a) => !a); }} className="mono text-xs border hairline px-3 h-9 hover:border-[var(--accent)]">{auto ? "pause" : "▶ autoplay"}</button>
          <div className="flex-1 flex gap-1 ml-2">{steps.map((x, j) => <button key={x.date} onClick={() => setI(j)} aria-label={`step ${x.date.slice(0, 10)}`} className="flex-1 h-1.5" style={{ background: j <= i ? (x.level === "ok" ? "var(--ok)" : x.level === "warn" ? "var(--warn)" : "var(--bad)") : "var(--line-2)" }} />)}</div>
        </div>
      </div>

      <div aria-live="polite">
        <p className="mono text-sm text-accent">{new Date(s.date).toUTCString().replace(":00 GMT", " UTC")}</p>
        <h2 className="text-3xl font-light mt-2">{s.headline}</h2>
        <p className="text-chrome mt-3 leading-relaxed">{s.detail}</p>
        <div className="flex items-center gap-4 mt-5">
          <Grade grade={s.grade} score={s.score} />
          {s.red && <span className="mono text-xs text-bad border border-[var(--bad)] px-2 py-1">RED: a protected vault would have exited</span>}
        </div>
        <p className="label mt-8 mb-3">what Overwatch would have sent</p>
        {s.alerts.length ? (
          <ul className="space-y-3">{s.alerts.map((a, j) => (
            <li key={j} className="panel p-4 border-l-2" style={{ borderLeftColor: a.severity === "CRITICAL" ? "var(--bad)" : "var(--warn)" }}>
              <div className="flex flex-wrap gap-2 items-center mb-2"><Sev s={a.severity} />{a.labels.map((l) => <span key={l} className="mono text-[10px] text-bad">{l}</span>)}<span className="mono text-[10px] text-dim">via Telegram · webhook · registry</span></div>
              <p className="text-ink">{a.title}</p>
              <p className="text-chrome text-sm mt-1 leading-relaxed">{a.explanation}</p>
            </li>))}</ul>
        ) : <p className="mono text-sm text-dim">No alert. Overwatch records this as the baseline.</p>}
      </div>
    </div>
  );
}
