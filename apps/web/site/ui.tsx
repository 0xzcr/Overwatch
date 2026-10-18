import type { CSSProperties, ReactNode } from "react";
import type { MorphOptions } from "./engine/stage";
import type { ShapeName } from "./engine/shapes";
import { GLOSSARY } from "./content";
import { explorer, GRADE_WORD } from "@/lib/format";

export const cssVars = (v: Record<string, string>) => v as CSSProperties;

/** Markup attributes that tell the particle stage which shape to show while this section is in view. */
export function stage(shape: ShapeName | "drift", opts: MorphOptions = {}, pulse = false) {
  return {
    "data-stage": shape,
    "data-stage-opts": JSON.stringify(opts),
    ...(pulse ? { "data-stage-pulse": "1" } : {}),
  };
}

export function Vis({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Technical term with a "What does this mean?" tooltip (hover or keyboard focus, no JS). */
export function Term({ t, children }: { t: string; children?: ReactNode }) {
  const text = GLOSSARY[t.toLowerCase()];
  if (!text) return <>{children ?? t}</>;
  return (
    <span className="term" tabIndex={0}>
      {children ?? t}
      <span className="term__tip" role="tooltip">
        <b className="mono">What does this mean?</b>
        {text}
      </span>
    </span>
  );
}

export function Grade({
  grade,
  score,
  size = "md",
}: {
  grade: string | null;
  score: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const g = grade ?? "?";
  return (
    <span className={`grade grade--${size} g-${g}`}>
      <b>{g}</b>
      <span className="mono">
        {score ?? "—"}
        {size !== "sm" && <> · {GRADE_WORD[g] ?? "Unscored"}</>}
      </span>
    </span>
  );
}

export function Badge({
  tone = "dim",
  children,
}: {
  tone?: "ok" | "warn" | "bad" | "dim" | "accent" | "violet";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone} mono`}>{children}</span>;
}

export function Addr({
  v,
  network = "mainnet",
  kind = "address",
  full = false,
}: {
  v: string | null | undefined;
  network?: "mainnet" | "devnet";
  kind?: "address" | "tx";
  full?: boolean;
}) {
  if (!v) return <span className="mono addr addr--none">none</span>;
  const real = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(v);
  if (!real)
    return (
      <span className="mono addr" title="placeholder (reconstructed)">
        {v}
      </span>
    );
  return (
    <a href={explorer(kind, v, network)} target="_blank" rel="noreferrer" className="mono addr" title={v}>
      {full ? v : `${v.slice(0, 4)}…${v.slice(-4)}`}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

/** Page header in the same visual language as the landing hero. */
export function PageHero({
  eyebrow,
  lines,
  lede,
  aside,
  stageAttrs,
  dock,
  compact = true,
}: {
  eyebrow?: ReactNode;
  lines: ReactNode[];
  lede?: ReactNode;
  aside?: ReactNode;
  stageAttrs: ReturnType<typeof stage>;
  dock: string;
  compact?: boolean;
}) {
  return (
    <section className={`hero${compact ? " hero--page" : ""}`} id="top" data-dock={dock} {...stageAttrs}>
      <div className="hero__title-wrap">
        {eyebrow && <p className="hero__eyebrow mono">{eyebrow}</p>}
        <h1 className="hero__title hero__title--page">
          {lines.map((l, i) => (
            <span className="hero__line" key={i}>
              <span>{l}</span>
            </span>
          ))}
        </h1>
      </div>
      {(lede || aside) && (
        <div className="hero__aside">
          {lede && <p className="hero__lede">{lede}</p>}
          {aside}
        </div>
      )}
    </section>
  );
}

export function SectionHead({ title, lede, row = false }: { title: ReactNode; lede?: ReactNode; row?: boolean }) {
  return (
    <header className={`section-head${row ? " section-head--row" : ""}`}>
      <div>
        <h2 className="h2">{title}</h2>
      </div>
      {lede && <p className="section-head__lede">{lede}</p>}
    </header>
  );
}
