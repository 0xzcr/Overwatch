import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AUTHORITY_LABEL, fmtDuration, findVaultIndex, isOnCurve, mintRisks } from "@overwatch/core";
import { fetchRiskRecord, riskPda } from "@overwatch/sdk";
import { buildGraph, type GEdge, type GNode } from "@/lib/graph";
import { loadProtocol, SNAPSHOT_LABEL, type ProtoCard } from "@/site/data";
import { ControlGraph } from "@/site/ControlGraph";
import { Timeline } from "@/site/Timeline";
import { Addr, Badge, Grade, PageHero, SectionHead, Term, stage } from "@/site/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = await loadProtocol((await params).slug);
  return { title: d ? `${d.card.name} controls` : "Not found" };
}

const PERMS = (m: number) => [m & 1 && "initiate", m & 2 && "vote", m & 4 && "execute"].filter(Boolean).join(" · ");

/** Without a live snapshot we can still draw the shape of control from the snapshot facts (no addresses). */
function summaryGraph(c: ProtoCard): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [{ id: "p", kind: "program", label: c.name, sub: "program", danger: false, layer: 0 }];
  const edges: GEdge[] = [];
  const single = c.flags.includes("SINGLE_KEY");
  nodes.push({ id: "a", kind: "authority", label: c.authority, sub: single ? "one private key" : "upgrade authority", danger: single, layer: 1 });
  edges.push({ from: "p", to: "a", label: "upgrade authority", danger: single });
  const m = /^(\d+)-of-(\d+)$/.exec(c.threshold);
  if (m) {
    const weak = c.timelockSec === 0 || Number(m[1]) <= 2;
    nodes.push({ id: "m", kind: "multisig", label: `Squads ${c.threshold}`, sub: `timelock ${c.timelock}`, danger: weak, layer: 2 });
    edges.push({ from: "a", to: "m", label: "vault of" });
    for (let i = 0; i < Number(m[2]); i++) {
      nodes.push({ id: `s${i}`, kind: "signer", label: `Signer ${i + 1}`, sub: "member", danger: false, layer: 3 });
      edges.push({ from: "m", to: `s${i}` });
    }
  }
  return { nodes, edges };
}

export default async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await loadProtocol(slug);
  if (!d) notFound();
  const { card: p, view, events, live } = d;
  const s = view?.snapshot ?? null;
  const net = view?.network ?? "mainnet";
  const graph = s ? buildGraph(s) : summaryGraph(p);
  const registryId = process.env.REGISTRY_PROGRAM_ID;
  const devnetRpc = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
  const record = registryId
    ? await Promise.race([fetchRiskRecord(devnetRpc, slug, registryId).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))])
    : null;
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const tone = p.grade === "A" || p.grade === "B" ? "#2BFFB0" : p.grade === "C" ? "#FFB547" : "#FF5A3D";

  return (
    <>
      <PageHero
        dock={p.name}
        eyebrow={
          <span className="detail__crumbs">
            <Link href="/protocols">← Control map</Link> <span>{p.category}</span> <span>{live ? "live from mainnet" : SNAPSHOT_LABEL}</span>
          </span>
        }
        lines={[p.name]}
        lede={
          <>
            {p.red ? (
              <span className="bad">Red: a vault reading the Overwatch registry would exit now.</span>
            ) : (
              <>Who can change {p.name}, read straight from the chain.</>
            )}{" "}
            {p.tvl !== "—" && <span className="mono hero__src">TVL {p.tvl} (DefiLlama, display only)</span>}
          </>
        }
        aside={
          <div className="detail__grade">
            <Grade grade={p.grade} score={p.score} size="lg" />
            <div className="detail__badges">
              {p.verified ? <Badge tone="ok">verified onchain</Badge> : <Badge tone="warn">unverified</Badge>}
              {p.source === "demo" && <Badge tone="accent">demo · devnet</Badge>}
              {p.red && <Badge tone="bad">red</Badge>}
            </div>
          </div>
        }
        stageAttrs={stage("graph", { colorA: tone, colorB: "#1d6bff", x: 2.6, y: 0.4, yNarrow: 1.5, scale: 0.85, opacity: 1, front: true, sway: 0.4 })}
      />

      <section className="page-block" data-dock="Control graph" {...stage("graph", { colorA: tone, colorB: "#1b2340", opacity: 0.22, scale: 1.4, autoRotate: 0.04 })}>
        <SectionHead label="01" title={<>Who can move your money</>} />
        <ControlGraph nodes={graph.nodes} edges={graph.edges} network={net} summary={!s} />
      </section>

      <section className="page-block detail__grid" data-dock="Facts">
        <div>
          <SectionHead label="02" title="Facts" />
          {s ? (
            <dl className="facts">
              {s.programs.map((x) => (
                <div key={x.programId} className="facts__card" data-tilt>
                  <dt className="label mono">{x.label}</dt>
                  <dd className="facts__rows">
                    <span>Program</span>
                    <Addr v={x.programId} network={net} full />
                    <span>ProgramData</span>
                    <Addr v={x.programDataAddress} network={net} full />
                    <span>Last deploy slot</span>
                    <span className="mono">{x.lastDeploySlot}</span>
                    <span>
                      <Term t="upgrade authority">Upgrade authority</Term>
                    </span>
                    <Addr v={x.upgradeAuthority} network={net} full />
                    <span>Authority type</span>
                    <span className={x.authorityKind === "SINGLE_KEY" ? "bad" : ""}>{AUTHORITY_LABEL[x.authorityKind]}</span>
                  </dd>
                </div>
              ))}
              {s.multisigs.map((m) => (
                <div key={m.address} className="facts__card">
                  <dt className="label mono">
                    <Term t="multisig">Squads v4 multisig</Term> · {m.role.replace("_", " ")}
                  </dt>
                  <dd className="facts__rows">
                    <span>Address</span>
                    <Addr v={m.address} network={net} full />
                    <span>
                      <Term t="threshold">Threshold</Term>
                    </span>
                    <span className={`mono${m.threshold <= 2 ? " bad" : ""}`}>
                      {m.threshold} of {m.members.length}
                    </span>
                    <span>
                      <Term t="timelock">Timelock</Term>
                    </span>
                    <span className={m.timeLockSec === 0 ? "bad" : ""}>
                      {fmtDuration(m.timeLockSec)} <span className="mono dim">({m.timeLockSec}s)</span>
                    </span>
                    <span>
                      <Term t="config authority">Config authority</Term>
                    </span>
                    {m.configAuthority ? (
                      <span className="bad">
                        <Addr v={m.configAuthority} network={net} /> can change everything without a vote
                      </span>
                    ) : (
                      <span>none, so changes need a vote</span>
                    )}
                    <span>Pending config</span>
                    <span>{m.pending.length ? m.pending.map((x) => `#${x.transactionIndex}: ${x.actions.map((a) => a.kind).join(", ")}`).join("; ") : "none"}</span>
                  </dd>
                  <table className="facts__signers">
                    <thead>
                      <tr>
                        <th>Signer</th>
                        <th>Permissions</th>
                        <th>
                          <Term t="durable nonce">Nonce accounts</Term>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.members.map((mem) => {
                        const n = s.nonces.filter((x) => x.authority === mem.key);
                        return (
                          <tr key={mem.key}>
                            <td>
                              <Addr v={mem.key} network={net} />
                            </td>
                            <td className="mono dim">{PERMS(mem.permissions)}</td>
                            <td className={`mono${n.length ? " bad" : " dim"}`}>{n.length ? n.map((x) => <Addr key={x.address} v={x.address} network={net} />) : "none"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
              {!!s.mints.length && (
                <div className="facts__card">
                  <dt className="label mono">Collateral tokens</dt>
                  {s.mints.map((m) => (
                    <dd key={m.address} className="facts__mint">
                      <Addr v={m.address} network={net} />
                      <span className="mono dim">{m.tokenProgram}</span>
                      {mintRisks(m).map((r) => (
                        <Badge key={r} tone={r === "PermanentDelegate" || r === "TransferHook" ? "bad" : "warn"}>
                          {r}
                        </Badge>
                      ))}
                    </dd>
                  ))}
                </div>
              )}
              {!!s.oracles.length && (
                <div className="facts__card">
                  <dt className="label mono">
                    <Term t="oracle">Oracles</Term>
                  </dt>
                  {s.oracles.map((o) => (
                    <dd key={o.address} className="facts__mint">
                      <Addr v={o.address} network={net} />
                      <span className="mono dim">{o.kind.toLowerCase()}</span>
                      {o.deprecated && <Badge tone="bad">deprecated</Badge>}
                    </dd>
                  ))}
                </div>
              )}
              <div className={`facts__card${s.admin.length ? "" : " is-dashed"}`}>
                <dt className="label mono">Admin config</dt>
                {s.admin.length ? (
                  s.admin.map((a) => {
                    const vaultMatch = s.multisigs.some((m) => a.admin && findVaultIndex(m.address, a.admin) !== null);
                    const kind = !a.admin
                      ? "none"
                      : vaultMatch
                        ? "same Squads vault as upgrades"
                        : isOnCurve(a.admin)
                          ? "single key (could be MPC/HSM-held, not verifiable onchain)"
                          : "program address (unmapped)";
                    return (
                      <dd key={a.account} className="facts__rows">
                        <span>Account</span>
                        <span>
                          <Addr v={a.account} network={net} /> <span className="mono dim">{a.adapter}</span>
                        </span>
                        <span>Admin</span>
                        <span>
                          <Addr v={a.admin} network={net} /> <span className={kind.startsWith("single") ? "warn" : "dim"}>{kind}</span>
                        </span>
                        {a.guardian && (
                          <>
                            <span>Guardian</span>
                            <Addr v={a.guardian} network={net} />
                          </>
                        )}
                        {Object.entries(a.params)
                          .filter(([, v]) => v !== null)
                          .map(([k, v]) => (
                            <Fragment key={k}>
                              <span>{k}</span>
                              <span className="mono">{String(v)}</span>
                            </Fragment>
                          ))}
                      </dd>
                    );
                  })
                ) : (
                  <dd className="dim">
                    Admin config: <span className="warn">not yet mapped</span>. Coming soon: this protocol&apos;s admin, listing authority and withdraw limits, decoded from its IDL.
                  </dd>
                )}
              </div>
            </dl>
          ) : (
            <dl className="facts">
              <div className="facts__card">
                <dt className="label mono">From the {SNAPSHOT_LABEL}</dt>
                <dd className="facts__rows">
                  <span>
                    <Term t="upgrade authority">Upgrade authority</Term>
                  </span>
                  <span className={p.flags.includes("SINGLE_KEY") ? "bad" : ""}>{p.authority}</span>
                  <span>
                    <Term t="multisig">Multisig</Term>
                  </span>
                  <span className="mono">{p.threshold}</span>
                  <span>
                    <Term t="timelock">Timelock</Term>
                  </span>
                  <span className={p.timelockSec === 0 ? "bad" : ""}>{p.timelock}</span>
                  <span>Flags</span>
                  <span className="mono">{p.flags.join(", ") || "none"}</span>
                </dd>
              </div>
              <div className="facts__card is-dashed">
                <dd className="dim">Raw accounts, signers, nonce accounts, collateral and oracles load from the live database, which is not connected here.</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="detail__side">
          <div>
            <SectionHead label="03" title="Score breakdown" />
            <div className="breakdown">
              <div className="breakdown__row">
                <span>Start</span>
                <span className="mono">100</span>
              </div>
              {p.breakdown.map((b, i) => (
                <div key={i} className="breakdown__row">
                  <span>{b.reason}</span>
                  <span className="mono bad">−{b.points}</span>
                </div>
              ))}
              {!p.breakdown.length && <div className="breakdown__row dim">{live ? "No deductions." : "Deductions load with live data. The grade below is from the snapshot."}</div>}
              <div className="breakdown__row breakdown__total">
                <span className="label mono">Score</span>
                <span className="mono">
                  {p.score ?? "—"} · {p.grade}
                </span>
              </div>
            </div>
            <p className="page-note mono">
              flags: [{p.flags.join(", ") || "none"}] · <Link href="/methodology">methodology →</Link>
            </p>
          </div>

          <div>
            <SectionHead label="04" title="Onchain registry" />
            {record ? (
              <dl className="facts__card facts__rows">
                <span>RiskRecord PDA</span>
                <Addr v={riskPda(slug, registryId)} network="devnet" />
                <span>Score / grade</span>
                <span className="mono">
                  {record.score} / {record.grade}
                </span>
                <span>Flags</span>
                <span className="mono">
                  {record.flags.toString()} {record.red && <span className="bad">RED</span>}
                </span>
                <span>Version</span>
                <span className="mono">
                  {record.version} (slot {record.updatedSlot.toString()})
                </span>
                <span>Publisher</span>
                <Addr v={record.publisher} network="devnet" />
              </dl>
            ) : (
              <p className="page-note">Not published to the devnet registry yet. The indexer pushes a RiskRecord after the first live score.</p>
            )}
            <p className="page-note mono">
              Any Solana program can read this account (owner and <Term t="pda">PDA</Term> check) and act on it. <Link href="/vault">See the protected vault →</Link>
            </p>
          </div>

          <div>
            <SectionHead label="05" title="Get alerts" />
            <div className="detail__ctas">
              {bot ? (
                <a href={`https://t.me/${bot}?start=watch_${slug}`} className="btn btn--glow btn--sm" data-cursor="Telegram">
                  <span>Telegram: watch {p.name}</span>
                </a>
              ) : (
                <span className="btn btn--ghost btn--sm is-disabled" title="Set TELEGRAM_BOT_USERNAME">
                  <span>Telegram bot: coming soon</span>
                </span>
              )}
              <Link href={`/alerts?protocol=${slug}`} className="btn btn--ghost btn--sm" data-cursor="Alerts">
                <span>Webhook / email</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="page-block" data-dock="Timeline">
        <SectionHead label="06" title="Governance timeline" />
        <Timeline
          events={events}
          network={net}
          empty={live ? undefined : "The governance timeline loads from the live database (backfill + live events), which is not connected here."}
        />
      </section>
    </>
  );
}
