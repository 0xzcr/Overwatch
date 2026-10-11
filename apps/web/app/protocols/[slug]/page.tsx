import { notFound } from "next/navigation";
import Link from "next/link";
import { getProtocol, getEvents } from "@/lib/data";
import { ControlGraph } from "@/components/ControlGraph";
import { Timeline } from "@/components/Timeline";
import { Grade } from "@/components/ui/Grade";
import { Addr } from "@/components/ui/Addr";
import { Term } from "@/components/ui/Term";
import { Section, Badge } from "@/components/ui/Section";
import { usd } from "@/lib/format";
import { fmtDuration, AUTHORITY_LABEL, mintRisks } from "@overwatch/core";
import { fetchRiskRecord, riskPda } from "@overwatch/sdk";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProtocol((await params).slug);
  return { title: p ? `${p.name} controls` : "Not found" };
}

const PERMS = (m: number) => [m & 1 && "initiate", m & 2 && "vote", m & 4 && "execute"].filter(Boolean).join(" · ");

export default async function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProtocol(slug);
  if (!p) notFound();
  const events = await getEvents({ protocolId: p.id, limit: 100 });
  const s = p.snapshot;
  const net = p.network;
  const devnetRpc = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
  const record = process.env.REGISTRY_PROGRAM_ID ? await fetchRiskRecord(devnetRpc, slug, process.env.REGISTRY_PROGRAM_ID).catch(() => null) : null;
  const bot = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <div className="px-4 sm:px-10 pt-28 space-y-14">
      <header className="grid lg:grid-cols-[1fr_auto] gap-8 items-end">
        <div>
          <p className="label flex flex-wrap gap-3 items-center">
            <Link href="/protocols" className="hover:text-ink">← control map</Link><span>{p.category}</span><span>{net}</span>
            {p.verified ? <Badge tone="ok">verified onchain</Badge> : <Badge tone="warn">unverified</Badge>}
            {p.source === "demo" && <Badge tone="accent">demo · devnet</Badge>}
          </p>
          <h1 className="text-5xl sm:text-7xl font-light mt-4">{p.name}</h1>
          <p className="mono text-xs text-chrome mt-3">TVL {usd(p.tvlUsd)} (DefiLlama, display only) · snapshot slot {s?.slot ?? "—"} · {p.website && <a href={p.website} className="hover:text-accent" target="_blank" rel="noreferrer">{p.website.replace(/^https?:\/\//, "")} ↗</a>}</p>
        </div>
        <div className="flex items-center gap-6">
          <Grade grade={p.grade} score={p.score} size="lg" />
          {p.red && <div className="border border-[var(--bad)] text-bad px-3 py-2 mono text-xs max-w-48 pulse-bad">RED: vaults reading the Overwatch registry would exit now</div>}
        </div>
      </header>

      <Section k="01" title={<>Who can move your money</>}>
        <ControlGraph snapshot={s} network={net} />
      </Section>

      <div className="grid lg:grid-cols-2 gap-14">
        <Section k="02" title="Facts">
          <dl className="space-y-6 text-sm">
            {s?.programs.map((x) => (
              <div key={x.programId} className="border hairline p-4">
                <dt className="label mb-3">{x.label}</dt>
                <dd className="grid grid-cols-[9rem_1fr] gap-y-2 gap-x-3">
                  <span className="text-dim">Program</span><Addr v={x.programId} network={net} full />
                  <span className="text-dim">ProgramData</span><Addr v={x.programDataAddress} network={net} full />
                  <span className="text-dim">Last deploy slot</span><span className="mono">{x.lastDeploySlot}</span>
                  <span className="text-dim"><Term t="upgrade authority" /></span><Addr v={x.upgradeAuthority} network={net} full />
                  <span className="text-dim">Authority type</span><span className={x.authorityKind === "SINGLE_KEY" ? "text-bad" : ""}>{AUTHORITY_LABEL[x.authorityKind]}</span>
                </dd>
              </div>
            ))}
            {s?.multisigs.map((m) => (
              <div key={m.address} className="border hairline p-4">
                <dt className="label mb-3"><Term t="multisig">Squads v4 multisig</Term> · {m.role.replace("_", " ")}</dt>
                <dd className="grid grid-cols-[9rem_1fr] gap-y-2 gap-x-3">
                  <span className="text-dim">Address</span><Addr v={m.address} network={net} full />
                  <span className="text-dim"><Term t="threshold" /></span><span className={m.threshold <= 2 ? "text-bad mono" : "mono"}>{m.threshold} of {m.members.length}</span>
                  <span className="text-dim"><Term t="timelock" /></span><span className={m.timeLockSec === 0 ? "text-bad" : ""}>{fmtDuration(m.timeLockSec)} <span className="mono text-dim">({m.timeLockSec}s)</span></span>
                  <span className="text-dim"><Term t="config authority" /></span>{m.configAuthority ? <span className="text-bad"><Addr v={m.configAuthority} network={net} /> can change everything without a vote</span> : <span>none, so changes need a vote</span>}
                  <span className="text-dim">Pending config</span><span>{m.pending.length ? m.pending.map((x) => `#${x.transactionIndex}: ${x.actions.map((a) => a.kind).join(", ")}`).join("; ") : "none"}</span>
                </dd>
                <table className="w-full mt-4 text-xs">
                  <thead><tr className="text-dim text-left"><th className="font-normal py-1">Signer</th><th className="font-normal">Permissions</th><th className="font-normal"><Term t="durable nonce">Nonce accts</Term></th></tr></thead>
                  <tbody>{m.members.map((mem) => { const n = s.nonces.filter((x) => x.authority === mem.key); return (
                    <tr key={mem.key} className="border-t hairline"><td className="py-1.5"><Addr v={mem.key} network={net} /></td><td className="mono text-chrome">{PERMS(mem.permissions)}</td><td className={n.length ? "text-bad mono" : "text-dim mono"}>{n.length ? n.map((x) => <Addr key={x.address} v={x.address} network={net} />) : "none"}</td></tr>); })}</tbody>
                </table>
              </div>
            ))}
            {!!s?.mints.length && (
              <div className="border hairline p-4">
                <dt className="label mb-3">Collateral tokens</dt>
                {s.mints.map((m) => <dd key={m.address} className="flex flex-wrap gap-2 items-center py-1"><Addr v={m.address} network={net} /><span className="mono text-[11px] text-dim">{m.tokenProgram}</span>{mintRisks(m).map((r) => <Badge key={r} tone={r === "PermanentDelegate" || r === "TransferHook" ? "bad" : "warn"}>{r}</Badge>)}</dd>)}
              </div>
            )}
            <div className="border hairline p-4 border-dashed">
              <dt className="label mb-2">Admin config</dt>
              <dd className="text-chrome">{s?.admin.length ? s.admin.map((a) => <span key={a.account}>admin <Addr v={a.admin} network={net} /></span>) : <>Admin config: <span className="text-warn">not yet mapped</span>. Coming soon: decoding this protocol&apos;s admin, listing-authority and withdraw-limit settings from its IDL.</>}</dd>
            </div>
          </dl>
        </Section>

        <div className="space-y-14">
          <Section k="03" title="Score breakdown">
            <div className="border hairline">
              <div className="flex justify-between px-4 py-3 border-b hairline"><span className="text-chrome">Start</span><span className="mono">100</span></div>
              {p.breakdown.map((d) => <div key={d.key} className="flex justify-between gap-6 px-4 py-3 border-b hairline"><span className="text-sm">{d.reason}</span><span className="mono text-bad shrink-0">−{d.points}</span></div>)}
              {!p.breakdown.length && <div className="px-4 py-3 text-sm text-chrome">No deductions.</div>}
              <div className="flex justify-between px-4 py-3"><span className="label">Score</span><span className="mono text-ink">{p.score ?? "—"} · {p.grade ?? "—"}</span></div>
            </div>
            <p className="mono text-[11px] text-dim mt-3">flags: [{p.flagNames.join(", ") || "none"}] = {p.flags} · <Link href="/methodology" className="hover:text-accent">methodology →</Link></p>
          </Section>

          <Section k="04" title="Onchain registry (devnet)">
            {record ? (
              <div className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm border hairline p-4">
                <span className="text-dim">RiskRecord PDA</span><Addr v={riskPda(slug, process.env.REGISTRY_PROGRAM_ID)} network="devnet" />
                <span className="text-dim">Score / grade</span><span className="mono">{record.score} / {record.grade}</span>
                <span className="text-dim">Flags</span><span className="mono">{record.flags.toString()} {record.red && <span className="text-bad">RED</span>}</span>
                <span className="text-dim">Version</span><span className="mono">{record.version} (updated slot {record.updatedSlot.toString()})</span>
                <span className="text-dim">Publisher</span><Addr v={record.publisher} network="devnet" />
              </div>
            ) : <p className="text-sm text-chrome">Not published yet. The indexer pushes a record to the devnet registry after the first score.</p>}
            <p className="text-xs text-dim mt-3">Any Solana program can read this account (owner and PDA check) to act on Overwatch scores. See the demo vault.</p>
          </Section>

          <Section k="05" title="Get alerts">
            <div className="flex flex-wrap gap-3">
              {bot ? <a href={`https://t.me/${bot}?start=watch_${slug}`} className="mono text-xs tracking-[0.15em] uppercase px-4 py-3 bg-accent text-[var(--accent-ink)]">Telegram: watch {p.name}</a> : <span className="mono text-xs px-4 py-3 border hairline text-dim">Telegram bot: coming soon (set TELEGRAM_BOT_USERNAME)</span>}
              <Link href={`/alerts?protocol=${slug}`} className="mono text-xs tracking-[0.15em] uppercase px-4 py-3 border hairline hover:border-[var(--accent)]">Webhook / email</Link>
            </div>
          </Section>
        </div>
      </div>

      <Section k="06" title="Governance timeline">
        <Timeline events={events} network={net} />
      </Section>
    </div>
  );
}
