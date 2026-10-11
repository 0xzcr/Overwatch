"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SEV_COLOR, ago } from "@/lib/format";

export interface TickerItem { id: number; slug: string; name: string; severity: string; title: string; at: string }

export function Ticker({ initial }: { initial: TickerItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("event", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setItems((x) => [{ id: d.id, slug: d.slug, name: d.name, severity: d.severity, title: d.title, at: d.at }, ...x].slice(0, 30));
    });
    return () => es.close();
  }, []);
  if (!items.length) return <div className="mono text-xs text-dim px-4 py-3">no events yet — the indexer is watching.</div>;
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y hairline bg-[var(--glass)]" aria-label="Live event ticker">
      <div className="ticker-track flex w-max gap-10 py-2.5 px-4">
        {row.map((e, i) => (
          <Link key={`${e.id}-${i}`} href={`/protocols/${e.slug}`} className="mono text-[11px] whitespace-nowrap flex items-center gap-2 hover:text-ink text-chrome" aria-hidden={i >= items.length}>
            <span style={{ color: SEV_COLOR[e.severity] }}>●</span>
            <span className="text-ink">{e.name}</span>
            <span>{e.title}</span>
            <span className="text-dim">{ago(e.at)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
