import { loadProtocols } from "@/site/data";
import { AlertsForms } from "@/site/AlertsForms";
import { PageHero, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function Alerts({ searchParams }: { searchParams: Promise<{ protocol?: string }> }) {
  const [{ cards }, sp] = await Promise.all([loadProtocols(), searchParams]);
  return (
    <>
      <PageHero
        dock="Alerts"
        eyebrow={<span data-scramble>Alerts · free for depositors</span>}
        lines={["Get the alarm", <span key="s" className="serif hero__accent">where you are.</span>]}
        lede="Each alert is plain English: what changed, why it matters, what you can do, with links to the transaction. Curators and funds use the API."
        stageAttrs={stage("burst", { colorA: "#FF5A3D", colorB: "#FFB547", x: 2.7, y: 0.4, yNarrow: 1.5, scale: 0.8, opacity: 1, autoRotate: 0.14 })}
      />
      <section className="page-block" data-dock="Channels" {...stage("burst", { colorA: "#FF5A3D", colorB: "#1b2340", opacity: 0.22, scale: 1.3, autoRotate: 0.05 })}>
        <AlertsForms
          protocols={cards.map((p) => ({ slug: p.slug, name: p.name }))}
          preselect={sp.protocol}
          bot={process.env.TELEGRAM_BOT_USERNAME || undefined}
          emailEnabled={!!process.env.RESEND_API_KEY}
        />
      </section>
    </>
  );
}
