import { loadProtocols } from "@/site/data";
import { Leaderboard } from "@/site/Leaderboard";
import { PageHero, stage } from "@/site/ui";
import { JsonLd, breadcrumbs, pageMetadata, DATASET_COMMON } from "@/site/seo";
import { SITE_URL } from "@/site/content";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = pageMetadata({
  title: "Control map",
  description:
    "Live control grades for Solana DeFi protocols: who holds each upgrade key, multisig thresholds, timelocks, signers and durable nonces, read from mainnet.",
  path: "/protocols",
});

export default async function Protocols() {
  const { live, cards, headline: h } = await loadProtocols();
  // The newest control change across all protocols tells search engines how fresh the grades are.
  const lastChanges = cards.map((c) => c.lastChange).filter((d): d is string => !!d);
  const newest = lastChanges.sort().at(-1);
  return (
    <>
      <JsonLd
        data={[
          breadcrumbs([["Control map", "/protocols"]]),
          {
            "@type": "Dataset",
            name: "Solana DeFi protocol control grades",
            description:
              "Who can change each watched Solana DeFi protocol: upgrade authority, multisig threshold, timelock, signers and durable nonce accounts, with a 0 to 100 control grade and risk flags, read from mainnet accounts.",
            url: `${SITE_URL}/protocols`,
            ...(newest && { dateModified: newest }),
            keywords: ["Solana", "DeFi", "upgrade authority", "multisig", "timelock", "durable nonce", "risk"],
            ...DATASET_COMMON,
            distribution: {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${SITE_URL}/api/v1/protocols`,
            },
          },
          {
            "@type": "ItemList",
            name: "Watched Solana DeFi protocols",
            itemListElement: cards.map((c, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `${c.name} (grade ${c.grade})`,
              url: `${SITE_URL}/protocols/${c.slug}`,
            })),
          },
        ]}
      />
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
