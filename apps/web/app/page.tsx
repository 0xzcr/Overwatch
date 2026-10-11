import Link from "next/link";
import { getProtocols, getEvents, headline } from "@/lib/data";
import { Hero3D } from "@/components/three/Hero3D";
import { CodeWall } from "@/components/three/CodeWall";
import { Ticker } from "@/components/Ticker";
import { fmtDuration, short } from "@overwatch/core";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const [ps, evs, h] = await Promise.all([getProtocols(), getEvents({ limit: 30, minSeverity: "MEDIUM" }), headline()]);
  const nodes = ps.map((p) => ({ slug: p.slug, name: p.name, grade: p.grade, red: p.red, tvl: p.tvlUsd, flags: p.flagNames }));
  const wall = ps.flatMap((p) => {
    const s = p.snapshot;
    if (!s) return [];
    return [
      `// ${p.slug} · slot ${s.slot} · ${p.grade ?? "?"} ${p.score ?? ""}`,
      ...s.programs.map((x) => `programdata ${short(x.programDataAddress)} deploy_slot=${x.lastDeploySlot} upgrade_authority=${short(x.upgradeAuthority)} → ${x.authorityKind === "SINGLE_KEY" ? "single key" : x.authorityKind}`),
      ...s.multisigs.map((m) => `squads_v4 ${short(m.address)} threshold=${m.threshold}/${m.members.length} timelock=${m.timeLockSec}s (${fmtDuration(m.timeLockSec)}) config_authority=${m.configAuthority ? short(m.configAuthority) : "none"}`),
      ...s.nonces.map((n) => `nonce ${short(n.address)} authority=${short(n.authority)} durable=true`),
      ...p.breakdown.map((d) => `  -${d.points} ${d.reason}`),
      p.red ? `  RED flags=[${p.flagNames.join(",")}]` : "",
    ].filter(Boolean);
  });
  const critical = evs.filter((e) => e.severity === "CRITICAL").length;

  return (
    <>
      <section className="relative h-[100svh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0 opacity-45 [mask-image:linear-gradient(180deg,black_0%,black_30%,transparent_62%)]"><CodeWall lines={wall} /></div>
        <div className="absolute inset-0 md:left-[28%]"><Hero3D nodes={nodes} /></div>
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,var(--bg)_0%,color-mix(in_oklab,var(--bg)_70%,transparent)_38%,transparent_60%)]" />
        <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-10 pb-24 max-w-3xl pointer-events-none">
          <p className="label mb-5"><span className="text-accent">●</span> watching {h.total} Solana protocols for depositors</p>
          <h1 className="text-[clamp(2.6rem,7vw,5.8rem)] leading-[0.92] tracking-[-0.02em] font-light">
            Know who can <span className="serif text-accent glow-accent">move</span><br />your money.
          </h1>
          <p className="mt-6 text-chrome max-w-xl text-base sm:text-lg leading-relaxed">
            <span className="text-ink mono">{h.lowNoDelay} of {h.total}</span> top Solana protocols can be changed by ≤2 people with no delay.{" "}
            <span className="text-ink mono">{h.weak}</span> have no timelock or a single upgrade key, and <span className="text-ink mono">{h.unmapped}</span> have controls we haven&apos;t been able to map yet. Overwatch alerts you the moment these locks get weaker.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 pointer-events-auto">
            <Link href="/protocols" className="mono text-xs tracking-[0.2em] uppercase px-5 py-3 bg-accent text-[var(--accent-ink)] hover:opacity-90">See the control map →</Link>
            <Link href="/case/drift" className="mono text-xs tracking-[0.2em] uppercase px-5 py-3 border hairline hover:border-[var(--accent)]">Drift: 9 days of warning</Link>
          </div>
          <p className="mono text-[10px] text-dim mt-6">live from mainnet · stat computed {new Date(h.at).toUTCString()} · {critical} critical alerts in feed</p>
        </div>
        <span className="absolute right-4 sm:right-10 bottom-16 label hidden sm:block">// a smoke detector for defi.</span>
      </section>

      <Ticker initial={evs.map((e) => ({ id: e.id, slug: e.slug, name: e.name, severity: e.severity, title: e.title, at: e.blockTime ?? e.detectedAt }))} />

      <section className="px-4 sm:px-10 py-24 grid md:grid-cols-3 gap-px bg-[var(--line)]">
        {[
          ["01", "Map", "For every major protocol we decode who can upgrade the code, which multisig controls it, how many signers must agree, and how long changes must wait. All of it is read straight from the chain, with a link to every raw account."],
          ["02", "Watch", "We subscribe to every one of those accounts and to every signer. When a timelock drops, a threshold falls, a key changes hands or a signer creates never-expiring pre-signed transactions, we see it within seconds."],
          ["03", "Warn and act", "You get a plain-English alert on Telegram, webhook or email. The score is published onchain, so vaults can pull funds automatically. Our demo vault does exactly that."],
        ].map(([k, t, d]) => (
          <div key={k} className="bg-bg p-8 min-h-64 flex flex-col">
            <span className="mono text-dim text-xs">{k}</span>
            <h3 className="serif text-4xl mt-6 mb-4">{t}</h3>
            <p className="text-chrome leading-relaxed text-sm">{d}</p>
          </div>
        ))}
      </section>

      <section className="px-4 sm:px-10 pb-28">
        <Link href="/case/drift" className="group block border hairline p-8 sm:p-14 relative overflow-hidden hover:border-[var(--bad)] transition-colors">
          <p className="label text-bad">case study · reconstructed from public incident reports</p>
          <h2 className="text-3xl sm:text-5xl font-light mt-4 leading-tight max-w-3xl">Drift lost <span className="serif text-bad">$285M</span> in 12 minutes. The warning signs were onchain <span className="serif">9 days</span> earlier.</h2>
          <p className="mono text-xs text-chrome mt-6 group-hover:text-ink">replay the alerts Overwatch would have sent →</p>
        </Link>
      </section>
    </>
  );
}
