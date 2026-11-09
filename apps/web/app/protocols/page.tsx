import { loadProtocols } from "@/site/data";
import { Leaderboard } from "@/site/Leaderboard";
import { PageHero, stage, JsonLd, breadcrumbs, pageMetadata, DATASET_COMMON } from "@/site/ui"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = pageMetadata({
  // SEO component
  title: "Control map",
  // SEO component
  description:
    "Live control grades for Solana DeFi protocols: who holds each upgrade key, multisig thresholds, timelocks, signers and durable nonces, read from mainnet.", // SEO component
  path: "/protocols", // SEO component
}); // SEO component

export default async function Protocols() {
  const { live, cards, headline: h } = await loadProtocols();
  // The newest control change across all protocols tells search engines how fresh the grades are.
  const lastChanges = cards.map((c) => c.lastChange).filter((d): d is string => !!d); // SEO component
  const newest = lastChanges.sort().at(-1); // SEO component
  return (
    <>
      <JsonLd // SEO component
        data={[
          // SEO component
          breadcrumbs([["Control map", "/protocols"]]), // SEO component
          {
            // SEO component
            "@type": "Dataset", // SEO component
            name: "Solana DeFi protocol control grades", // SEO component
            // SEO component
            description:
              "Who can change each watched Solana DeFi protocol: upgrade authority, multisig threshold, timelock, signers and durable nonce accounts, with a 0 to 100 control grade and risk flags, read from mainnet accounts.", // SEO component
            url: `${SITE_URL}/protocols`, // SEO component
            ...(newest && { dateModified: newest }), // SEO component
            keywords: ["Solana", "DeFi", "upgrade authority", "multisig", "timelock", "durable nonce", "risk"], // SEO component
            ...DATASET_COMMON, // SEO component
            distribution: {
              // SEO component
              "@type": "DataDownload", // SEO component
              encodingFormat: "application/json", // SEO component
              contentUrl: `${SITE_URL}/api/v1/protocols`, // SEO component
            }, // SEO component
          }, // SEO component
          {
            // SEO component
            "@type": "ItemList", // SEO component
            name: "Watched Solana DeFi protocols", // SEO component
            itemListElement: cards.map((c, index) => ({
              // SEO component
              "@type": "ListItem", // SEO component
              position: index + 1, // SEO component
              name: `${c.name} (grade ${c.grade})`, // SEO component
              url: `${SITE_URL}/protocols/${c.slug}`, // SEO component
            })), // SEO component
          }, // SEO component
        ]} // SEO component
      />
      {/* SEO component */}
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
