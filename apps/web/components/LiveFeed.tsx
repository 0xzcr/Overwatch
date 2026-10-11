"use client";
import { useEffect, useMemo, useState } from "react";
import { Timeline } from "./Timeline";
import type { EventView } from "@/lib/data";

const SEVS = ["INFO", "MEDIUM", "HIGH", "CRITICAL"];

export function LiveFeed({ initial, protocols }: { initial: EventView[]; protocols: { slug: string; name: string }[] }) {
  const [items, setItems] = useState(initial);
  const [min, setMin] = useState("INFO");
  const [proto, setProto] = useState("all");
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("event", (ev) => {
      const d = JSON.parse((ev as MessageEvent).data);
      const e: EventView = { id: d.id, slug: d.slug, name: d.name, type: d.type, severity: d.severity, weakening: d.severity !== "INFO", title: d.title, explanation: d.explanation, labels: d.labels ?? [], before: null, after: null, slot: null, txSignature: d.txSignature, source: d.slug === "overwatch-demo" ? "demo" : "live", blockTime: null, detectedAt: d.at };
      setItems((x) => [e, ...x.filter((y) => y.id !== e.id)].slice(0, 300));
      setFlash(e.id);
      setTimeout(() => setFlash(null), 2500);
    });
    return () => es.close();
  }, []);
  const shown = useMemo(() => items.filter((e) => SEVS.indexOf(e.severity) >= SEVS.indexOf(min) || (min === "INFO")).filter((e) => proto === "all" || e.slug === proto), [items, min, proto]);
  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-8">
        <span className="mono text-xs flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${live ? "bg-ok" : "bg-bad"}`} />{live ? "streaming (SSE)" : "reconnecting…"}</span>
        <div className="flex gap-1" role="group" aria-label="Minimum severity">
          {SEVS.map((s) => <button key={s} onClick={() => setMin(s)} className={`mono text-[11px] px-2.5 h-8 border ${min === s ? "border-[var(--accent)] text-accent" : "hairline text-dim"}`}>≥ {s.toLowerCase()}</button>)}
        </div>
        <select value={proto} onChange={(e) => setProto(e.target.value)} aria-label="Protocol" className="mono text-xs h-8 bg-bg border hairline px-2">
          <option value="all">all protocols</option>
          {protocols.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
      </div>
      {flash && <div className="mono text-xs text-accent mb-4 cursor-blink">new event</div>}
      <Timeline events={shown} network="mainnet" showProtocol />
    </div>
  );
}
