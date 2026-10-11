import { getEvents, getProtocols } from "@/lib/data";
import { LiveFeed } from "@/components/LiveFeed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live events" };

export default async function Events() {
  const [evs, ps] = await Promise.all([getEvents({ limit: 200 }), getProtocols()]);
  return (
    <div className="px-4 sm:px-10 pt-28 max-w-5xl">
      <p className="label">live feed</p>
      <h1 className="text-4xl sm:text-6xl font-light mt-4 mb-3">Every change, <span className="serif text-accent">as it happens</span>.</h1>
      <p className="text-chrome mb-10 max-w-2xl">Weakening changes are amber or red. Changes that strengthen controls are shown in green. Demo events come from the devnet demo protocol and are labeled.</p>
      <LiveFeed initial={evs} protocols={ps.map((p) => ({ slug: p.slug, name: p.name }))} />
    </div>
  );
}
