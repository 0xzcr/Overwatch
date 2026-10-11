import { loadProtocols, SNAPSHOT_LABEL } from "@/site/data";
import { Leaderboard } from "@/site/Leaderboard";
import { PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Control map" };

export default async function Protocols() {
  const { live, cards, headline: h } = await loadProtocols();
  return (
    <>
      <PageHero
        dock="Control map"
        eyebrow={<span data-scramble>Control map · {live ? "live from mainnet" : SNAPSHOT_LABEL}</span>}
        lines={["Who can move", <span key="s" className="serif hero__accent">the money.</span>]}
        lede={
          <>
            <b className="mono">
              {h.lowNoDelay} of the top {h.total}
            </b>{" "}
            Solana protocols can be changed by ≤2 people with no delay. {h.noTimelock} multisigs have no timelock at all.
          </>
        }
        stageAttrs={stage("globe", { colorA: "#2BFFB0", colorB: "#1d6bff", opacity: 1, x: 2.9, y: 0.6, yNarrow: 1.4, scale: 0.85, arcs: true, autoRotate: 0.07, tiltX: 0.3 })}
      />
      <section className="page-block" data-dock="Leaderboard" {...stage("globe", { colorA: "#2BFFB0", colorB: "#1d6bff", opacity: 0.3, x: 0, scale: 1.4, arcs: true, autoRotate: 0.04, tiltX: 0.3 })}>
        <Leaderboard rows={cards} />
        <p className="page-note mono">
          {live
            ? "Read straight from mainnet. TVL comes from DefiLlama and is shown for context only; it never affects a grade."
            : "Snapshot of the mainnet watch list from Oct 11 2026. The live database is not connected here, so TVL, nonce exposure and last-change columns are empty."}
        </p>
      </section>
    </>
  );
}
