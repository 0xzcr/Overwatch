import { loadEvents, loadProtocols } from "@/site/data";
import { LiveFeed } from "@/site/LiveFeed";
import { PageHero, JsonLd, breadcrumbs, pageMetadata, DATASET_COMMON } from "@/site/ui"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = pageMetadata({
  // SEO component
  title: "Live events", // SEO component
  // SEO component
  description:
    "Every control change Overwatch has detected on Solana DeFi protocols: program upgrades, signer changes, timelock cuts and pre-signed transactions, each with its slot.", // SEO component
  path: "/events", // SEO component
}); // SEO component

export default async function Events() {
  const [{ live, events }, { cards }] = await Promise.all([loadEvents(200), loadProtocols()]);
  const newest = events[0]?.detectedAt; // SEO component
  return (
    <>
      <JsonLd // SEO component
        data={[
          // SEO component
          breadcrumbs([["Live events", "/events"]]), // SEO component
          {
            // SEO component
            "@type": "Dataset", // SEO component
            name: "Solana DeFi control-change events", // SEO component
            // SEO component
            description:
              "Typed events for every detected change to who controls a watched Solana DeFi protocol (upgrades, signer and threshold changes, timelock changes, durable nonce activity), with severity, slot and transaction signature.", // SEO component
            url: `${SITE_URL}/events`, // SEO component
            ...(newest && { dateModified: newest }), // SEO component
            keywords: ["Solana", "DeFi", "security", "upgrade", "multisig", "durable nonce", "alerts"], // SEO component
            ...DATASET_COMMON, // SEO component
            distribution: {
              // SEO component
              "@type": "DataDownload", // SEO component
              encodingFormat: "application/json", // SEO component
              contentUrl: `${SITE_URL}/api/v1/events`, // SEO component
            }, // SEO component
          }, // SEO component
        ]} // SEO component
      />
      {/* SEO component */}
      <PageHero
        dock="Live events"
        lines={["Live events"]}
        lede="Every change to who controls a watched protocol: caught live, or found in the last 180 days of onchain history. Open a row for what it means and the transaction."
      />
      <section className="page-block" data-dock="Feed">
        <LiveFeed initial={events} live={live} protocols={cards.map((p) => ({ slug: p.slug, name: p.name }))} />
      </section>
    </>
  );
}
