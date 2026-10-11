import { GRADE_META } from "@/lib/format";

export function Grade({ grade, score, size = "md" }: { grade: string | null; score?: number | null; size?: "sm" | "md" | "lg" }) {
  if (!grade) return <span className="mono text-dim text-xs">unscored</span>;
  const m = GRADE_META[grade] ?? { color: "var(--dim)", label: "" };
  const box = size === "lg" ? "w-20 h-20 text-5xl" : size === "sm" ? "w-7 h-7 text-sm" : "w-10 h-10 text-xl";
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Grade ${grade}, ${m.label}${score != null ? `, ${score} out of 100` : ""}`}>
      <span className={`${box} inline-flex items-center justify-center serif border`} style={{ color: m.color, borderColor: m.color, boxShadow: `0 0 24px -8px ${m.color}` }}>{grade}</span>
      <span className="flex flex-col leading-tight">
        {score != null && <span className="mono text-ink text-sm">{score}<span className="text-dim">/100</span></span>}
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: m.color }}>{m.label}</span>
      </span>
    </span>
  );
}

export function Sev({ s }: { s: string }) {
  const color = { CRITICAL: "var(--bad)", HIGH: "var(--warn)", MEDIUM: "var(--info)", LOW: "var(--chrome)", INFO: "var(--ok)" }[s] ?? "var(--dim)";
  return (
    <span className="mono text-[10px] tracking-[0.18em] px-1.5 py-0.5 border inline-flex items-center gap-1.5" style={{ color, borderColor: color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {s === "INFO" ? "STRENGTHENED" : s}
    </span>
  );
}
