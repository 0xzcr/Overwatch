import { loadEvents, loadProtocols } from "@/site/data";
import { LiveFeed } from "@/site/LiveFeed";
import { PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live events" };

export default async function Events() {
  const [{ events }, { cards }] = await Promise.all([loadEvents(200), loadProtocols()]);
  return (
    <>
      <PageHero
        dock="Live events"
        lines={["Every change,", <span key="s" className="serif hero__accent">as it happens.</span>]}
        lede="Timelocks, thresholds, upgrade keys, signers, durable nonces, pending votes, collateral and oracles. Weakening changes in amber or red, strengthening changes in green."
        stageAttrs={stage("radar", { colorA: "#7CF3FF", colorB: "#3b4dff", x: 2.6, y: 0.3, yNarrow: 1.4, opacity: 1, autoRotate: 0.12 })}
      />
      <section className="page-block" data-dock="Feed" {...stage("radar", { colorA: "#7CF3FF", colorB: "#1b2340", opacity: 0.25, scale: 1.4, autoRotate: 0.05 })}>
        <LiveFeed initial={events} protocols={cards.map((p) => ({ slug: p.slug, name: p.name }))} />
      </section>
    </>
  );
}
