import { loadEvents, loadProtocols } from "@/site/data";
import { LiveFeed } from "@/site/LiveFeed";
import { PageHero, stage } from "@/site/ui";

// Cached and rebuilt in the background at most every 30 s: the data only changes when the indexer writes,
// so visitors get a ready page instead of waiting on the database.
export const revalidate = 30;
export const metadata = { title: "Live events", alternates: { canonical: "/events" } };

export default async function Events() {
  const [{ live, events }, { cards }] = await Promise.all([loadEvents(200), loadProtocols()]);
  return (
    <>
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
