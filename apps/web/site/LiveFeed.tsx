"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FeedItem } from "./data";

const LEVELS = [
  { min: "INFO", label: "All" },
  { min: "MEDIUM", label: "Medium+" },
  { min: "HIGH", label: "High+" },
  { min: "CRITICAL", label: "Critical" },
];
const RANK: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const at = (e: FeedItem) => e.blockTime ?? e.detectedAt;
// Fixed locale and zone, so the server and the browser render the same text.
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
/** "marginfi has a pending vote…" reads as "has a pending vote…" next to the protocol column. */
const rest = (e: FeedItem) => (e.name && e.title.startsWith(`${e.name} `) ? e.title.slice(e.name.length + 1) : e.title);

/** Event log over Server-Sent Events (/api/v1/stream): grouped by UTC day, filterable, one line per change. */
export function LiveFeed({
  initial,
  protocols,
  live,
}: {
  initial: FeedItem[];
  protocols: { slug: string; name: string }[];
  live: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [min, setMin] = useState("INFO");
  const [proto, setProto] = useState("all");
  const [deploys, setDeploys] = useState(true);
  // "live" while either the stream or the polling fallback is getting through; a dropped stream reconnects on its own.
  const [streamUp, setStreamUp] = useState(false);
  const [polledAt, setPolledAt] = useState(0);
  const [now, setNow] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const add = (fresh: FeedItem[]) =>
      setItems((x) => {
        const seen = new Set(x.map((y) => y.id));
        const news = fresh.filter((e) => !seen.has(e.id));
        if (!news.length) return x;
        setFlash(news[0]!.id);
        window.setTimeout(() => setFlash(null), 4000);
        return [...news, ...x].sort((a, b) => at(b).localeCompare(at(a))).slice(0, 300);
      });

    const es = new EventSource("/api/v1/stream");
    es.onopen = () => setStreamUp(true);
    es.onerror = () => setStreamUp(false);
    es.addEventListener("event", (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as Partial<FeedItem> & { id: number; at?: string };
      add([
        {
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
          source: d.source ?? "live",
          blockTime: null,
          detectedAt: d.at ?? new Date().toISOString(),
        },
      ]);
    });

    const poll = async () => {
      try {
        const r = await fetch("/api/feed", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { events: FeedItem[] };
        add(j.events);
        setPolledAt(Date.now());
      } catch {
        /* the next poll or the stream will catch up */
      }
    };
    void poll();
    const pollId = window.setInterval(() => void poll(), 20_000);
    setNow(Date.now());
    const tickId = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      es.close();
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, []);
  const status = streamUp || (polledAt && now - polledAt < 65_000) ? "live" : polledAt ? "syncing" : "connecting";

  const shown = useMemo(
    () =>
      items.filter(
        (e) =>
          (RANK[e.severity] ?? 0) >= RANK[min]! &&
          (proto === "all" || e.slug === proto) &&
          (deploys || e.type !== "PROGRAM_UPGRADED"),
      ),
    [items, min, proto, deploys],
  );
  // Consecutive runs of the same UTC day; the list is already newest-first.
  const days = useMemo(() => {
    const out: { key: string; label: string; rows: FeedItem[] }[] = [];
    for (const e of shown) {
      const key = at(e).slice(0, 10);
      if (out.at(-1)?.key !== key) out.push({ key, label: day(at(e)), rows: [] });
      out.at(-1)!.rows.push(e);
    }
    return out;
  }, [shown]);
  const serious = shown.filter((e) => RANK[e.severity]! >= RANK.HIGH!).length;

  return (
    <div className="evlog">
      <div className="evlog__bar">
        <span className={`evlog__status mono is-${status}`}>
          {status === "live" ? "Live" : status === "syncing" ? "Syncing" : "Connecting"}
        </span>
        <span className="evlog__count mono">
          {shown.length} {shown.length === 1 ? "event" : "events"}
          {serious > 0 && (
            <>
              {" "}
              · <b>{serious} high or critical</b>
            </>
          )}
        </span>
        <div className="evlog__filters">
          <div className="chips" role="group" aria-label="Minimum severity">
            {LEVELS.map((l) => (
              <button
                key={l.min}
                className={`chip chip--tag${min === l.min ? " is-on" : ""}`}
                aria-pressed={min === l.min}
                onClick={() => setMin(l.min)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            className={`chip chip--tag${deploys ? "" : " is-on"}`}
            aria-pressed={!deploys}
            onClick={() => setDeploys((x) => !x)}
          >
            Hide code deploys
          </button>
          <label className="select mono">
            <span className="sr-only">Protocol</span>
            <select value={proto} onChange={(e) => setProto(e.target.value)}>
              <option value="all">All protocols</option>
              {protocols.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!shown.length ? (
        <div className="evlog__empty">
          <b>
            {items.length
              ? "Nothing matches these filters."
              : live
                ? "No events recorded yet."
                : "No event history on this deployment."}
          </b>
          {live || items.length ? (
            <p>
              New changes appear here within seconds of confirming onchain. Durable nonce accounts are scanned hourly.
            </p>
          ) : (
            <p>
              The live database isn&apos;t connected here. To see how alerts read, step through the{" "}
              <Link href="/case-study">Drift replay</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="evlog__list">
          <div className="evlog__head mono" aria-hidden="true">
            <span>UTC</span>
            <span>Severity</span>
            <span>Protocol</span>
            <span>Change</span>
          </div>
          {days.map((g) => (
            // div, not section: the site styles and docks every <section> as a page section.
            <div key={g.key} role="group" aria-label={g.label}>
              <h2 className="evlog__day mono">
                {g.label} <span>{g.rows.length}</span>
              </h2>
              <ul>
                {g.rows.map((e) => (
                  <li
                    key={e.id}
                    className={`evlog__row sev-${e.severity.toLowerCase()}${flash === e.id ? " is-new" : ""}`}
                  >
                    <details>
                      <summary>
                        <time className="mono" dateTime={at(e)}>
                          {clock(at(e))}
                        </time>
                        <span className="evlog__sev mono">{e.severity}</span>
                        <span className="evlog__proto">{e.name}</span>
                        <span className="evlog__title">
                          {rest(e)}
                          {!e.weakening && e.severity === "INFO" && (
                            <span className="evlog__tag is-good mono">stronger</span>
                          )}
                          {e.labels.map((l) => (
                            <span key={l} className="evlog__tag is-bad mono">
                              {l}
                            </span>
                          ))}
                          {/* Most rows come from scanning past transactions, so the rarer live catches carry the tag. */}
                          {e.source === "live" && (
                            <span className="evlog__tag is-live mono" title="Caught by live monitoring as it happened">
                              live
                            </span>
                          )}
                        </span>
                      </summary>
                      <div className="evlog__more">
                        <p>{e.explanation}</p>
                        <p className="mono">
                          {e.slot != null && <span>slot {e.slot.toLocaleString("en-US")}</span>}
                          {e.txSignature && (
                            <a
                              href={`https://explorer.solana.com/tx/${e.txSignature}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              transaction ↗
                            </a>
                          )}
                          {e.slug && <Link href={`/protocols/${e.slug}`}>{e.name} controls →</Link>}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
