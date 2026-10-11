import { getProtocols } from "@/lib/data";
import { Leaderboard } from "@/components/Leaderboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Control map" };

export default async function Protocols() {
  const ps = await getProtocols();
  return (
    <div className="px-4 sm:px-10 pt-28">
      <p className="label">control map · {ps.length} protocols · sorted weakest first</p>
      <h1 className="text-4xl sm:text-6xl font-light mt-4 mb-3">Who can <span className="serif text-accent">change</span> the rules?</h1>
      <p className="text-chrome max-w-2xl mb-10">Every row is decoded live from Solana mainnet: the program&apos;s upgrade authority, the Squads multisig behind it, its threshold and timelock, and whether any signer holds never-expiring pre-signed transactions. TVL comes from DefiLlama and is shown for context only. It never affects the score.</p>
      <Leaderboard rows={ps.map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvlUsd, grade: p.grade, score: p.score, authority: p.authorityKind, threshold: p.threshold, timelockSec: p.timelockSec, nonceSigners: p.nonceSigners, lastChange: p.lastChange, verified: p.verified, red: p.red, source: p.source, controlled: p.controlled }))} />
    </div>
  );
}
