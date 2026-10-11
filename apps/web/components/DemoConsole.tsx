"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { explorer } from "@/lib/format";
import { Sev } from "./ui/Grade";

interface LogLine { line: string; sig?: string; at: string; kind?: "cmd" | "err" | "ok" }
interface Feed { kind: string; at: string; severity?: string; title?: string; explanation?: string; txSignature?: string; score?: number; grade?: string; red?: boolean; slug?: string; labels?: string[] }
type DemoState = { ready: boolean; demoMode: boolean; multisig?: { threshold: number; members: number; timeLock: number } | null; authorityIsVault?: boolean; upgradeAuthority?: string | null; risk?: { score: number; grade: string; red: boolean; version: number } | null; vault?: { idle: string; totalAllocated: string } | null; position?: { shielded: boolean; allocated: string } | null; state?: { multisig: string; demoProgram: string } };

const ACTIONS = [
  { id: "remove-timelock", label: "Remove timelock", desc: "Squads config: 2 days → 0" },
  { id: "lower-threshold", label: "Lower threshold to 1", desc: "Squads config: 2 → 1" },
  { id: "create-signer-nonce", label: "Create nonce account for signer", desc: "durable nonce, authority = signer" },
  { id: "transfer-authority", label: "Transfer upgrade authority to single key", desc: "vault tx: BPF SetAuthority" },
  { id: "reset", label: "Reset demo", desc: "restore controls, close nonces, re-arm vault" },
] as const;

const t = (iso: string) => new Date(iso).toISOString().slice(11, 19);

export function DemoConsole() {
  const [log, setLog] = useState<LogLine[]>([{ line: "overwatch demo console · devnet · real transactions", at: new Date().toISOString() }]);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [st, setSt] = useState<DemoState | null>(null);
  const [clickAt, setClickAt] = useState<number | null>(null);
  const [latency, setLatency] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => fetch("/api/demo/state").then((r) => r.json()).then(setSt).catch(() => {}), []);
  useEffect(() => { void refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [log]);
  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    const push = (kind: string) => (e: Event) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (kind !== "event" && d.slug !== "overwatch-demo") return;
      setFeed((f) => [{ kind, at: new Date().toISOString(), ...d }, ...f].slice(0, 60));
      if (kind === "event" && d.slug === "overwatch-demo") setClickAt((c) => { if (c) setLatency(`${((Date.now() - c) / 1000).toFixed(1)}s from click to alert`); return null; });
      if (kind !== "event") void refresh();
    };
    for (const k of ["event", "registry", "shield", "rearm"]) es.addEventListener(k, push(k));
    return () => es.close();
  }, [refresh]);

  const run = async (id: string, label: string) => {
    setBusy(id);
    setLatency(null);
    setClickAt(Date.now());
    setLog((l) => [...l, { line: `$ overwatch-demo ${id}   # ${label}`, at: new Date().toISOString(), kind: "cmd" }]);
    try {
      const r = await fetch(`/api/demo/${id}`, { method: "POST" });
      const j = await r.json();
      setLog((l) => [...l, ...((j.log ?? []) as LogLine[]), ...(j.ok ? [{ line: `done in ${(j.ms / 1000).toFixed(1)}s`, at: new Date().toISOString(), kind: "ok" as const }] : [{ line: `✘ ${j.error}`, at: new Date().toISOString(), kind: "err" as const }])]);
    } catch (e) {
      setLog((l) => [...l, { line: `✘ ${(e as Error).message}`, at: new Date().toISOString(), kind: "err" }]);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (st && !st.demoMode) return <p className="mono text-sm text-warn border border-[var(--warn)] p-4">Demo console is disabled. Set <span className="text-ink">DEMO_MODE=true</span> to enable it (devnet only).</p>;
  if (st && !st.ready) return <p className="mono text-sm text-warn border border-[var(--warn)] p-4">Demo isn&apos;t set up yet. Run <span className="text-ink">pnpm demo:setup</span>.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-[var(--line)] border hairline">
        {[
          ["multisig", st?.multisig ? `${st.multisig.threshold}-of-${st.multisig.members}` : "…", st?.multisig && st.multisig.threshold <= 1],
          ["timelock", st?.multisig ? (st.multisig.timeLock ? `${st.multisig.timeLock / 3600}h` : "none") : "…", st?.multisig?.timeLock === 0],
          ["upgrade auth", st ? (st.authorityIsVault ? "multisig vault" : "SINGLE KEY") : "…", st && !st.authorityIsVault],
          ["registry", st?.risk ? `${st.risk.grade} ${st.risk.score} · v${st.risk.version}` : "…", st?.risk?.red],
          ["vault position", st?.position ? (st.position.shielded ? "SHIELDED" : `${Number(st.position.allocated) / 1e6} allocated`) : "…", st?.position?.shielded],
        ].map(([k, v, bad]) => (
          <div key={k as string} className="bg-bg p-4"><p className="label !text-[10px]">{k}</p><p className={`mono text-lg mt-1 ${bad ? "text-bad" : "text-ink"}`}>{v as string}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button key={a.id} disabled={!!busy} onClick={() => run(a.id, a.label)} className={`text-left border px-4 py-3 min-w-52 transition-colors disabled:opacity-40 ${a.id === "reset" ? "hairline hover:border-[var(--ok)]" : "hairline hover:border-[var(--bad)]"} ${busy === a.id ? "border-[var(--accent)]" : ""}`}>
            <span className="block text-sm text-ink">{busy === a.id ? "running…" : a.label}</span>
            <span className="mono text-[10px] text-dim">{a.desc}</span>
          </button>
        ))}
      </div>
      {latency && <p className="mono text-sm text-accent glow-accent">⏱ {latency}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border hairline bg-[var(--bg-2)] relative scanlines">
          <div className="flex justify-between px-4 py-2 border-b hairline"><span className="label !text-[10px]">action log · devnet</span><span className="mono text-[10px] text-dim">every signature links to the explorer</span></div>
          <div ref={logRef} className="h-[460px] overflow-y-auto p-4 mono text-xs leading-relaxed space-y-1">
            {log.map((l, i) => (
              <div key={i} className={l.kind === "cmd" ? "text-accent mt-3" : l.kind === "err" ? "text-bad" : l.kind === "ok" ? "text-ok" : "text-chrome"}>
                <span className="text-dim mr-2">{t(l.at)}</span>{l.line}
                {l.sig && <a className="block pl-16 text-dim hover:text-accent break-all" href={explorer("tx", l.sig, "devnet")} target="_blank" rel="noreferrer">{l.sig} ↗</a>}
              </div>
            ))}
            {busy && <div className="text-dim cursor-blink">waiting for confirmation</div>}
          </div>
        </div>
        <div className="border hairline">
          <div className="flex justify-between px-4 py-2 border-b hairline"><span className="label !text-[10px]">overwatch · live</span><span className="mono text-[10px] text-dim">alerts · registry · vault shield</span></div>
          <div className="h-[460px] overflow-y-auto p-4 space-y-3">
            {!feed.length && <p className="mono text-xs text-dim">Listening. Press an action on the left.</p>}
            {feed.map((f, i) => (
              <div key={i} className={`border-l-2 pl-3 py-1 ${i === 0 ? "animate-pulse [animation-iteration-count:2]" : ""}`} style={{ borderLeftColor: f.kind === "shield" ? "var(--ok)" : f.kind === "registry" ? "var(--info)" : f.severity === "CRITICAL" ? "var(--bad)" : "var(--warn)" }}>
                <div className="flex flex-wrap items-center gap-2 mono text-[10px] text-dim">
                  <span>{t(f.at)}</span>
                  {f.kind === "event" && f.severity && <Sev s={f.severity} />}
                  {f.kind === "registry" && <span className="text-info">REGISTRY UPDATED · devnet</span>}
                  {f.kind === "shield" && <span className="text-ok">VAULT SHIELD TRIGGERED</span>}
                  {f.kind === "rearm" && <span className="text-ok">VAULT RE-ARMED</span>}
                  {f.labels?.map((l) => <span key={l} className="text-bad">{l}</span>)}
                  {f.kind === "event" && f.slug !== "overwatch-demo" && <span>{f.slug}</span>}
                </div>
                {f.kind === "event" && <><p className="text-sm text-ink mt-1">{f.title}</p><p className="text-xs text-chrome mt-0.5">{f.explanation}</p></>}
                {f.kind === "registry" && <p className="text-sm mt-1">upsert_risk → score <span className="mono">{f.score}</span> grade <span className="mono">{f.grade}</span> {f.red ? <span className="text-bad">RED</span> : <span className="text-ok">green</span>}</p>}
                {f.kind === "shield" && <p className="text-sm mt-1">check_and_exit moved 40,000 demo USDC from the demo strategy back to idle.</p>}
                {f.txSignature && <a className="mono text-[10px] text-dim hover:text-accent break-all" href={explorer("tx", f.txSignature, "devnet")} target="_blank" rel="noreferrer">{f.txSignature} ↗</a>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
