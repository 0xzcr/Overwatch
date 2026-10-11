import { Sev } from "./ui/Grade";
import { Addr } from "./ui/Addr";
import { Badge } from "./ui/Section";
import type { EventView } from "@/lib/data";

export function Timeline({ events, network, showProtocol = false }: { events: EventView[]; network: "mainnet" | "devnet"; showProtocol?: boolean }) {
  if (!events.length) return <p className="mono text-sm text-dim">No governance changes recorded yet. The current state is the baseline, and the next change will appear here within seconds.</p>;
  return (
    <ol className="relative border-l hairline ml-2">
      {events.map((e) => (
        <li key={e.id} className="pl-6 pb-7 relative">
          <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: e.weakening ? (e.severity === "CRITICAL" ? "var(--bad)" : "var(--warn)") : "var(--ok)" }} aria-hidden />
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Sev s={e.severity} />
            <span className="mono text-[11px] text-dim">{new Date(e.blockTime ?? e.detectedAt).toUTCString().replace(" GMT", " UTC")}</span>
            {e.source !== "live" && <Badge tone={e.source === "demo" ? "accent" : "dim"}>{e.source}</Badge>}
            {e.labels.map((l) => <Badge key={l} tone="bad">{l}</Badge>)}
            {showProtocol && <a href={`/protocols/${e.slug}`} className="mono text-[11px] text-chrome hover:text-accent">{e.name}</a>}
          </div>
          <p className="text-ink">{e.title}</p>
          <p className="text-chrome text-sm mt-1 leading-relaxed max-w-3xl">{e.explanation}</p>
          <p className="mono text-[11px] text-dim mt-2">{e.type}{e.slot ? ` · slot ${e.slot}` : ""}{e.txSignature && <> · tx <Addr v={e.txSignature} kind="tx" network={network} /></>}</p>
        </li>
      ))}
    </ol>
  );
}
