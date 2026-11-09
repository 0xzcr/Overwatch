import { loadProtocols } from "@/site/data";
import { AlertsForms } from "@/site/AlertsForms";
import { PageHero, JsonLd, breadcrumbs, pageMetadata } from "@/site/ui"; // SEO component

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  // SEO component
  title: "Alerts", // SEO component
  // SEO component
  description:
    "Get a Telegram message or a signed webhook when the controls of a Solana DeFi protocol you use get weaker, such as a removed timelock or a lowered multisig threshold.", // SEO component
  path: "/alerts", // SEO component
}); // SEO component

export default async function Alerts({ searchParams }: { searchParams: Promise<{ protocol?: string }> }) {
  const [{ cards }, sp] = await Promise.all([loadProtocols(), searchParams]);
  return (
    <>
      <JsonLd data={breadcrumbs([["Alerts", "/alerts"]])} />
      {/* SEO component */}
      <PageHero
        dock="Alerts"
        lines={["Alerts"]}
        lede="Each alert is plain English: what changed, why it matters, what you can do, with links to the transaction. Curators and funds use the API."
      />
      <section className="page-block" data-dock="Channels">
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
