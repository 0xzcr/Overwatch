"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface LogLine {
  line: string;
  sig?: string;
  at: string;
  kind?: "cmd" | "err" | "ok";
}
interface Feed {
  kind: string;
  at: string;
  severity?: string;
  title?: string;
  explanation?: string;
  txSignature?: string;
  score?: number;
  grade?: string;
  red?: boolean;
  slug?: string;
  labels?: string[];
}
type DemoState = {
  ready: boolean;
  demoMode: boolean;
  multisig?: { threshold: number; members: number; timeLock: number } | null;
  authorityIsVault?: boolean;
  risk?: { score: number; grade: string; red: boolean; version: number } | null;
  position?: { shielded: boolean; allocated: string } | null;
};

const ACTIONS = [
  { id: "remove-timelock", label: "Remove timelock", desc: "Squads config: 2 days → 0" },
  { id: "lower-threshold", label: "Lower threshold to 1", desc: "Squads config: 2 → 1" },
  { id: "create-signer-nonce", label: "Create nonce account for signer", desc: "durable nonce, authority = signer" },
  { id: "transfer-authority", label: "Transfer upgrade authority to single key", desc: "vault tx: BPF SetAuthority" },
  { id: "reset", label: "Reset demo", desc: "restore controls, close nonces, re-arm vault" },
] as const;

const t = (iso: string) => new Date(iso).toISOString().slice(11, 19);
const devnetTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Split screen: devnet action log on the left, Overwatch alerts, registry updates and vault shields arriving live on the right. */
export function DemoConsole({ enabled }: { enabled: boolean }) {
  const [log, setLog] = useState<LogLine[]>([{ line: "overwatch demo console · devnet · real transactions", at: new Date().toISOString() }]);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [st, setSt] = useState<DemoState | null>(null);
  const [offline, setOffline] = useState(false);
  const clickAt = useRef<number | null>(null);
  const [latency, setLatency] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    () =>
      fetch("/api/demo/state")
        .then((r) => r.json())
        .then((j: DemoState) => {
          setSt(j);
          setOffline(false);
        })
        .catch(() => setOffline(true)),
    [],
  );
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const i = window.setInterval(refresh, 5000);
    return () => window.clearInterval(i);
  }, [refresh, enabled]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [log]);
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/v1/stream");
    const push = (kind: string) => (e: Event) => {
      const d = JSON.parse((e as MessageEvent).data) as Feed;
      if (kind !== "event" && d.slug !== "overwatch-demo") return;
      setFeed((f) => [{ ...d, kind, at: new Date().toISOString() }, ...f].slice(0, 60));
      if (kind === "event" && d.slug === "overwatch-demo" && clickAt.current) {
        setLatency(`${((Date.now() - clickAt.current) / 1000).toFixed(1)}s from click to alert`);
        clickAt.current = null;
      }
      if (kind !== "event") void refresh();
    };
    for (const k of ["event", "registry", "shield", "rearm"]) es.addEventListener(k, push(k));
    return () => es.close();
  }, [refresh, enabled]);

  const run = async (id: string, label: string) => {
    setBusy(id);
    setLatency(null);
    clickAt.current = Date.now();
    setLog((l) => [...l, { line: `$ overwatch-demo ${id}   # ${label}`, at: new Date().toISOString(), kind: "cmd" }]);
    try {
      const r = await fetch(`/api/demo/${id}`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; ms?: number; error?: string; log?: LogLine[] };
      setLog((l) => [
        ...l,
        ...(j.log ?? []),
        j.ok ? { line: `done in ${((j.ms ?? 0) / 1000).toFixed(1)}s`, at: new Date().toISOString(), kind: "ok" as const } : { line: `✘ ${j.error ?? "failed"}`, at: new Date().toISOString(), kind: "err" as const },
      ]);
    } catch (e) {
      setLog((l) => [...l, { line: `✘ ${(e as Error).message}`, at: new Date().toISOString(), kind: "err" }]);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const blocked = !enabled ? "disabled" : offline ? "offline" : st && !st.demoMode ? "disabled" : st && !st.ready ? "setup" : null;

  return (
    <div className="demo">
      {blocked && (
        <p className="notice mono">
          {blocked === "disabled" && (
            <>
              The demo console is disabled. Set <b>DEMO_MODE=true</b> to enable it (devnet only).
            </>
          )}
          {blocked === "setup" && (
            <>
              The demo isn&apos;t set up yet. Run <b>pnpm demo:setup</b>.
            </>
          )}
          {blocked === "offline" && <>The demo backend isn&apos;t reachable from this deployment.</>}
        </p>
      )}
      <div className="kpis kpis--5">
        {(
          [
            ["multisig", st?.multisig ? `${st.multisig.threshold}-of-${st.multisig.members}` : "—", !!st?.multisig && st.multisig.threshold <= 1],
            ["timelock", st?.multisig ? (st.multisig.timeLock ? `${st.multisig.timeLock / 3600}h` : "none") : "—", st?.multisig?.timeLock === 0],
            ["upgrade auth", st?.ready ? (st.authorityIsVault ? "multisig vault" : "SINGLE KEY") : "—", !!st?.ready && !st.authorityIsVault],
            ["registry", st?.risk ? `${st.risk.grade} ${st.risk.score} · v${st.risk.version}` : "—", !!st?.risk?.red],
            ["vault position", st?.position ? (st.position.shielded ? "SHIELDED" : `${Number(st.position.allocated) / 1e6} allocated`) : "—", !!st?.position?.shielded],
          ] as const
        ).map(([k, v, bad]) => (
          <div key={k} className="kpi">
            <span className="mono">{k}</span>
            <b className={`mono${bad ? " bad" : ""}`}>{v}</b>
          </div>
        ))}
      </div>

      <div className="demo__actions">
        {ACTIONS.map((a) => (
          <button key={a.id} disabled={!!busy || !!blocked} onClick={() => run(a.id, a.label)} className={`demo__btn${a.id === "reset" ? " is-reset" : ""}${busy === a.id ? " is-busy" : ""}`}>
            <b>{busy === a.id ? "running…" : a.label}</b>
            <span className="mono">{a.desc}</span>
          </button>
        ))}
      </div>
      {latency && <p className="demo__latency mono">⏱ {latency}</p>}

      <div className="demo__split">
        <div className="log log--term">
          <div className="log__head mono">
            <span>action log · devnet</span>
            <span className="dim">every signature links to the explorer</span>
          </div>
          <div ref={logRef} className="log__body mono" data-lenis-prevent>
            {log.map((l, i) => (
              <div key={i} className={`log__line is-${l.kind ?? "info"}`}>
                <span className="dim">{t(l.at)}</span> {l.line}
                {l.sig && (
                  <a href={devnetTx(l.sig)} target="_blank" rel="noreferrer">
                    {l.sig} ↗
                  </a>
                )}
              </div>
            ))}
            {busy && <div className="log__line dim">waiting for confirmation…</div>}
          </div>
        </div>
        <div className="log">
          <div className="log__head mono">
            <span>overwatch · live</span>
            <span className="dim">alerts · registry · vault shield</span>
          </div>
          <div className="log__body" data-lenis-prevent>
            {!feed.length && <p className="mono dim">Listening. Press an action on the left.</p>}
            {feed.map((f, i) => (
              <div key={i} className={`demo__evt is-${f.kind}${f.severity === "CRITICAL" ? " is-crit" : ""}`}>
                <div className="mono demo__evt-meta">
                  <span>{t(f.at)}</span>
                  {f.kind === "event" && f.severity && <span className={`badge badge--${f.severity === "CRITICAL" ? "bad" : "warn"} mono`}>{f.severity}</span>}
                  {f.kind === "registry" && <span className="violet">REGISTRY UPDATED · devnet</span>}
                  {f.kind === "shield" && <span className="ok">VAULT SHIELD TRIGGERED</span>}
                  {f.kind === "rearm" && <span className="ok">VAULT RE-ARMED</span>}
                  {f.labels?.map((l) => (
                    <span key={l} className="bad">
                      {l}
                    </span>
                  ))}
                </div>
                {f.kind === "event" && (
                  <>
                    <b>{f.title}</b>
                    <p>{f.explanation}</p>
                  </>
                )}
                {f.kind === "registry" && (
                  <p>
                    upsert_risk → score <span className="mono">{f.score}</span> grade <span className="mono">{f.grade}</span> {f.red ? <span className="bad">RED</span> : <span className="ok">green</span>}
                  </p>
                )}
                {f.kind === "shield" && <p>check_and_exit moved the demo strategy&apos;s funds back to idle.</p>}
                {f.txSignature && (
                  <a className="mono" href={devnetTx(f.txSignature)} target="_blank" rel="noreferrer">
                    {f.txSignature} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
