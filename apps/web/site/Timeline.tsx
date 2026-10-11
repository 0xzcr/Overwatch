import Link from "next/link";
import type { FeedItem } from "./data";
import { Addr, Badge } from "./ui";

const sevTone = (s: string) => (s === "CRITICAL" ? "bad" : s === "HIGH" ? "warn" : s === "INFO" ? "ok" : "dim") as "bad" | "warn" | "ok" | "dim";

/** Governance timeline: weakening changes in amber/red, strengthening changes in green. */
export function Timeline({ events, network, showProtocol = false, empty }: { events: FeedItem[]; network: "mainnet" | "devnet"; showProtocol?: boolean; empty?: string }) {
  if (!events.length)
    return <p className="page-note mono">{empty ?? "No governance changes recorded yet. The current state is the baseline; the next change appears here within seconds."}</p>;
  return (
    <ol className="tl">
      {events.map((e) => (
        <li key={e.id} className={`tl__item sev-${e.severity.toLowerCase()}${e.weakening ? "" : " is-good"}`}>
          <span className="tl__dot" aria-hidden="true" />
          <div className="tl__meta mono">
            <Badge tone={sevTone(e.severity)}>{e.severity}</Badge>
            <time>{new Date(e.blockTime ?? e.detectedAt).toUTCString().replace(" GMT", " UTC")}</time>
            {e.source !== "live" && <Badge tone={e.source === "demo" ? "accent" : "dim"}>{e.source}</Badge>}
            {e.labels.map((l) => (
              <Badge key={l} tone="bad">
                {l}
              </Badge>
            ))}
            {showProtocol && (
              <Link href={`/protocols/${e.slug}`} className="tl__proto">
                {e.name}
              </Link>
            )}
          </div>
          <b className="tl__title">{e.title}</b>
          <p className="tl__text">{e.explanation}</p>
          <p className="tl__foot mono">
            {e.type}
            {e.slot ? ` · slot ${e.slot}` : ""}
            {e.txSignature && (
              <>
                {" "}
                · tx <Addr v={e.txSignature} kind="tx" network={network} />
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
