import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDuration } from "@overwatch/core";
import { currentAccount } from "@/lib/session";
import { getProtocol, getEvents } from "@/lib/data";
import { Grade, PageHero } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Private watch", robots: { index: false } };

/** A private watch, for its owner only. Public protocol pages are cached for everyone, so this one is separate. */
export default async function PrivateWatch({ params }: { params: Promise<{ slug: string }> }) {
  const account = await currentAccount();
  if (!account) notFound();
  const p = await getProtocol((await params).slug, account.id);
  if (!p || p.visibility !== "private") notFound();
  const events = await getEvents({ protocolId: p.id, limit: 50, ownerAccountId: account.id });
  return (
    <>
      <PageHero
        dock="Private watch"
        lines={[p.name]}
        lede="Private: only your account can see this protocol and its alerts."
      />
      <section className="page-block" data-dock="Grade">
        <div className="acct">
          <div className="acct__head">
            <Grade grade={p.grade ?? "?"} score={p.score} size="lg" />
            <p className="dim">{p.red ? "Red: funds can be drained with no protective delay." : "Not red."}</p>
            <Link className="btn btn--ghost btn--sm" href="/app">
              <span>Back to dashboard</span>
            </Link>
          </div>
          <table className="acct__table">
            <thead>
              <tr>
                <th>Control</th>
                <th>Keys to steal</th>
                <th>Delay</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {p.capabilities.map((c, i) => (
                <tr key={i}>
                  <td>{c.label}</td>
                  <td className="mono">{c.keys ?? "–"}</td>
                  <td className="mono">{c.delaySec ? fmtDuration(c.delaySec) : c.keys === null ? "–" : "none"}</td>
                  <td className={`mono${c.red ? " bad" : ""}`}>
                    {c.grade ?? (c.provisional ? "unverified" : "not graded")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="acct__list">
            {p.breakdown.map((b, i) => (
              <li key={i} className="dim">
                {b.reason}
              </li>
            ))}
          </ul>
          <section className="acct__section">
            <h2 className="acct__h">Changes</h2>
            {events.length ? (
              <ul className="acct__list">
                {events.map((e) => (
                  <li key={e.id}>
                    <span>
                      <span className="mono dim">{e.severity}</span> {e.title}
                    </span>
                    <span className="mono dim">{new Date(e.blockTime ?? e.detectedAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">No changes since watching started.</p>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
