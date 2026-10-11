export function Section({ k, title, children, className = "" }: { k: string; title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-t hairline pt-6 ${className}`}>
      <div className="flex items-baseline gap-4 mb-5">
        <span className="mono text-[11px] text-dim">{k}</span>
        {title && <h2 className="label">{title}</h2>}
      </div>
      {children}
    </section>
  );
}
export function Badge({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "accent" | "ok" | "bad" | "warn" }) {
  const c = { dim: "var(--dim)", accent: "var(--accent)", ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)" }[tone];
  return <span className="mono text-[10px] tracking-[0.16em] uppercase px-1.5 py-0.5 border" style={{ color: c, borderColor: c }}>{children}</span>;
}
