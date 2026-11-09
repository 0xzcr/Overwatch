import { loadEvents, loadProtocols } from "@/site/data";
import { LiveFeed } from "@/site/LiveFeed";
import { PageHero, stage } from "@/site/ui";
import { JsonLd, breadcrumbs, pageMetadata, DATASET_COMMON } from "@/site/seo";
import { SITE_URL } from "@/site/content";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = pageMetadata({
  title: "Live events",
  description:
    "Every control change Overwatch has detected on Solana DeFi protocols: program upgrades, signer changes, timelock cuts and pre-signed transactions, each with its slot.",
  path: "/events",
});

export default async function Events() {
  const [{ live, events }, { cards }] = await Promise.all([loadEvents(200), loadProtocols()]);
  const newest = events[0]?.detectedAt;
  return (
    <>
      <JsonLd
        data={[
          breadcrumbs([["Live events", "/events"]]),
          {
            "@type": "Dataset",
            name: "Solana DeFi control-change events",
            description:
              "Typed events for every detected change to who controls a watched Solana DeFi protocol (upgrades, signer and threshold changes, timelock changes, durable nonce activity), with severity, slot and transaction signature.",
            url: `${SITE_URL}/events`,
            ...(newest && { dateModified: newest }),
            keywords: ["Solana", "DeFi", "security", "upgrade", "multisig", "durable nonce", "alerts"],
            ...DATASET_COMMON,
            distribution: {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${SITE_URL}/api/v1/events`,
            },
          },
        ]}
      />
      <PageHero
        dock="Live events"
        lines={["Live events"]}
        lede="Every change to who controls a watched protocol: caught live, or found in the last 180 days of onchain history. Open a row for what it means and the transaction."
        stageAttrs={stage("radar", {
          colorA: "#7CF3FF",
          colorB: "#3b4dff",
          x: 2.6,
          y: 0.3,
          yNarrow: 1.4,
          opacity: 0.3,
          autoRotate: 0.06,
        })}
      />
      <section
        className="page-block"
        data-dock="Feed"
        {...stage("radar", { colorA: "#7CF3FF", colorB: "#1b2340", opacity: 0.1, scale: 1.4, autoRotate: 0.03 })}
      >
        <LiveFeed initial={events} live={live} protocols={cards.map((p) => ({ slug: p.slug, name: p.name }))} />
      </section>
    </>
  );
}
