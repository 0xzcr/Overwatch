"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FeedItem } from "./data";

const SEVS = ["INFO", "MEDIUM", "HIGH", "CRITICAL"];
const tone = (s: string) => (s === "CRITICAL" ? "bad" : s === "HIGH" ? "warn" : s === "INFO" ? "ok" : "dim");
// "12 Oct 2026, 17:58 UTC": fixed locale and zone, so the server and browser render the same text.
const when = (iso: string) => `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

/** Live feed over Server-Sent Events (/api/v1/stream), filterable by severity and protocol. */
export function LiveFeed({ initial, protocols, live }: { initial: FeedItem[]; protocols: { slug: string; name: string }[]; live: boolean }) {
  const [items, setItems] = useState(initial);
  const [min, setMin] = useState("INFO");
  const [proto, setProto] = useState("all");
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus("offline");
    es.addEventListener("event", (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as Partial<FeedItem> & { id: number; at?: string };
      const e: FeedItem = {
        id: d.id,
        slug: d.slug ?? "",
        name: d.name ?? d.slug ?? "",
        type: d.type ?? "",
        severity: d.severity ?? "INFO",
        weakening: d.weakening ?? d.severity !== "INFO",
        title: d.title ?? "",
        explanation: d.explanation ?? "",
        labels: d.labels ?? [],
        slot: d.slot ?? null,
        txSignature: d.txSignature ?? null,
        source: d.source ?? (d.slug === "overwatch-demo" ? "demo" : "live"),
        blockTime: null,
        detectedAt: d.at ?? new Date().toISOString(),
      };
      setItems((x) => [e, ...x.filter((y) => y.id !== e.id)].slice(0, 300));
      setFlash(e.id);
      window.setTimeout(() => setFlash(null), 2500);
    });
    return () => es.close();
  }, []);

  const shown = useMemo(
    () => items.filter((e) => SEVS.indexOf(e.severity) >= SEVS.indexOf(min) || min === "INFO").filter((e) => proto === "all" || e.slug === proto),
    [items, min, proto],
  );

  return (
    <div className="feedx">
      <div className="filters feedx__filters">
        <span className={`feedx__status mono is-${status}`}>
          <span className={`dot ${status === "live" ? "dot--live" : status === "offline" ? "dot--alert" : ""}`} />
          {status === "live" ? "streaming (SSE)" : status === "offline" ? "stream offline · retrying" : "connecting…"}
        </span>
        <div className="chips" role="group" aria-label="Minimum severity">
          {SEVS.map((s) => (
            <button key={s} className={`chip chip--tag${min === s ? " is-on" : ""}`} aria-pressed={min === s} onClick={() => setMin(s)}>
              ≥ {s.toLowerCase()}
            </button>
          ))}
        </div>
        <label className="select mono">
          <span className="sr-only">Protocol</span>
          <select value={proto} onChange={(e) => setProto(e.target.value)}>
            <option value="all">all protocols</option>
            {protocols.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!shown.length ? (
        <div className="feedx__empty">
          <p>
            <b>{items.length ? "No events at this severity." : live ? "No events recorded yet." : "No event history on this deployment."}</b>
          </p>
          {live || items.length ? (
            <p>Events appear here seconds after a change confirms onchain; durable nonce accounts are scanned hourly. Weakening changes are amber or red; changes that strengthen controls are green.</p>
          ) : (
            <p>
              The live database isn&apos;t connected here, so there is nothing to stream. To see an alert fire, use the <Link href="/demo">demo console</Link> or step through the{" "}
              <Link href="/case-study">Drift replay</Link>.
            </p>
          )}
        </div>
      ) : (
        <ol className="tl">
          {shown.map((e) => (
            <li key={e.id} className={`tl__item sev-${e.severity.toLowerCase()}${e.weakening ? "" : " is-good"}${flash === e.id ? " is-new" : ""}`}>
              <span className="tl__dot" aria-hidden="true" />
              <div className="tl__meta mono">
                {e.slug && (
                  <Link href={`/protocols/${e.slug}`} className="tl__proto">
                    {e.name}
                  </Link>
                )}
                <span className={`badge badge--${tone(e.severity)} mono`}>{e.severity}</span>
                {e.source === "demo" ? (
                  <span className="badge badge--accent mono">demo</span>
                ) : (
                  e.source !== "live" && (
                    <span className="badge badge--dim mono" title="Found by scanning past onchain transactions, not caught live">
                      history
                    </span>
                  )
                )}
                {e.labels.map((l) => (
                  <span key={l} className="badge badge--bad mono">
                    {l}
                  </span>
                ))}
                <time dateTime={e.blockTime ?? e.detectedAt}>{when(e.blockTime ?? e.detectedAt)}</time>
              </div>
              <b className="tl__title">{e.title}</b>
              <p className="tl__text">{e.explanation}</p>
              <p className="tl__foot mono">
                {e.slot != null && <>slot {e.slot.toLocaleString("en-US")}</>}
                {e.slot != null && e.txSignature && " · "}
                {e.txSignature && (
                  <a className="addr" href={`https://explorer.solana.com/tx/${e.txSignature}${e.source === "demo" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer">
                    view transaction ↗
                  </a>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
