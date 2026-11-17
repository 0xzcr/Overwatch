import { loadProtocols } from "@/site/data";
import { Dashboard } from "@/site/Dashboard";
import { PageHero, pageMetadata } from "@/site/ui";
import { billingConfig } from "@/lib/billing";
import { accountsOpen } from "@/lib/session";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  ...pageMetadata({
    title: "Dashboard",
    description: "Your Overwatch watchlist, alert channels, API keys, private watches and plan.",
    path: "/app",
  }),
  robots: { index: false },
};

/** The signed-in product: everything an account controls, in one page. */
export default async function App() {
  if (!accountsOpen())
    return (
      <PageHero
        dock="Dashboard"
        lines={["Coming soon"]}
        lede="Accounts, the dashboard and paid plans open soon. Every alert is free on Telegram until then, so enjoy it while you still can :D"
        aside={
          <Link className="btn btn--glow btn--sm" href="/alerts" style={{ justifySelf: "start" }}>
            <span>Get alerts now</span>
          </Link>
        }
      />
    );
  const { cards } = await loadProtocols();
  const billing = billingConfig();
  return (
    <>
      <PageHero
        dock="Dashboard"
        lines={["Dashboard"]}
        lede="Pick the protocols you hold, choose where alerts go, and Overwatch does the watching."
      />
      <section className="page-block" data-dock="Account">
        <Dashboard
          protocols={cards.map((p) => ({ slug: p.slug, name: p.name, grade: p.grade, red: p.red }))}
          billing={billing ? { network: billing.network } : null}
          bot={!!process.env.TELEGRAM_BOT_USERNAME}
          emailEnabled={!!process.env.RESEND_API_KEY}
        />
      </section>
    </>
  );
}
