import Link from "next/link";
import type { ProtoCard } from "./data";
import { Badge } from "./ui";

/** Compact protocol row used on the landing preview. */
export function ProtoRow({ p }: { p: ProtoCard }) {
  return (
    <li className={`proto g-${p.grade}${p.red ? " is-red" : ""}`}>
      <Link href={`/protocols/${p.slug}`} className="proto__link" data-cursor="Inspect">
        <span className="proto__grade">
          <b>{p.grade}</b>
          <span className="mono">{p.score ?? "—"}</span>
        </span>
        <span className="proto__name">
          <b>{p.name}</b>
          <span className="mono">{p.category}</span>
        </span>
        <span className="proto__fact mono">
          <span>authority</span>
          {p.authority}
        </span>
        <span className="proto__fact mono">
          <span>multisig</span>
          {p.threshold}
        </span>
        <span className={`proto__fact mono${p.timelockSec === 0 ? " bad" : ""}`}>
          <span>timelock</span>
          {p.timelock}
        </span>
        <span className="proto__flags mono">
          {p.flags.length ? p.flags.slice(0, 2).map((f) => <i key={f}>{f.replaceAll("_", " ").toLowerCase()}</i>) : <i className="ok">no flags</i>}
          {p.red && <Badge tone="bad">red</Badge>}
        </span>
        <span className="proto__go">↗</span>
      </Link>
    </li>
  );
}
