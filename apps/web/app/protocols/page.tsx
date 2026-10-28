import { loadProtocols } from "@/site/data";
import { Leaderboard } from "@/site/Leaderboard";
import { PageHero, stage } from "@/site/ui";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = {
  title: "Control map",
  alternates: { canonical: "/protocols" },
};

export default async function Protocols() {
  const { live, cards, headline: h } = await loadProtocols();
  return (
    <>
      <PageHero
        dock="Control map"
        lines={["Control map"]}
        lede={
          <>
            <b className="mono">
              {h.lowNoDelay} of the top {h.total}
            </b>{" "}
            Solana protocols can be changed by ≤2 people with no delay. {h.noTimelock} multisigs have no timelock at
            all. [Click on each protocol to know more]
          </>
        }
        stageAttrs={stage("globe", {
          colorA: "#2BFFB0",
          colorB: "#1d6bff",
          opacity: 1,
          x: 2.9,
          y: 0.6,
          yNarrow: 1.4,
          scale: 0.85,
          arcs: true,
          autoRotate: 0.07,
          tiltX: 0.3,
        })}
      />
      <section
        className="page-block"
        data-dock="Leaderboard"
        {...stage("globe", {
          colorA: "#2BFFB0",
          colorB: "#1d6bff",
          opacity: 0.3,
          x: 0,
          scale: 1.4,
          arcs: true,
          autoRotate: 0.04,
          tiltX: 0.3,
        })}
      >
        <Leaderboard rows={cards} />
        <p className="page-note">
          {live
            ? "Read straight from mainnet. TVL comes from DefiLlama and is shown for context only; it never affects a grade."
            : "Snapshot of the mainnet watch list from Oct 11 2026. TVL, nonce exposure and change history appear when the live database is connected."}
        </p>
      </section>
    </>
  );
}
