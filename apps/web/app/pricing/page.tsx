import Link from "next/link";
import { PLANS, type PlanId } from "@overwatch/core";
import { accountsOpen } from "@/lib/session";
import { PageHero, JsonLd, breadcrumbs, pageMetadata } from "@/site/ui"; // SEO component

export const metadata = pageMetadata({
  // SEO component
  title: "Pricing", // SEO component
  description:
    "Free HIGH and CRITICAL alerts for every Solana DeFi depositor. Pro and Team add every severity, signed webhooks, API keys and private watches, paid in USDC.", // SEO component
  path: "/pricing", // SEO component
}); // SEO component

const ORDER: PlanId[] = ["free", "pro", "team"];
const open = accountsOpen();

/** What each plan includes, from the same definition the server enforces (packages/core/src/plans.ts). */
export default function Pricing() {
  return (
    <>
      <JsonLd data={breadcrumbs([["Pricing", "/pricing"]])} />
      {/* SEO component */}
      <PageHero
        dock="Pricing"
        lines={["Pricing"]}
        lede="Safety alerts are free for everyone. Pay for depth, machine delivery and private watches, in USDC on Solana."
      />
      <section className="page-block" data-dock="Plans">
        <div className="plans">
          {ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <article key={id} className={`plan${id === "pro" ? " plan--featured" : ""}`}>
                <h2 className="plan__name">{plan.name}</h2>
                <p className="plan__who dim">{plan.audience}</p>
                {/* paid prices are veiled behind a mosaic until the plans go on sale */}
                <div className={id !== "free" && !open ? "plan__veil" : undefined} aria-hidden={id !== "free" && !open}>
                  <p className="plan__price">
                    <span className="mono">{plan.monthlyUsd === 0 ? "0" : plan.monthlyUsd}</span>
                    <span className="dim"> USDC / month</span>
                  </p>
                </div>
                <ul className="plan__features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {id !== "free" && !open ? (
                  // paid plans are not on sale yet: the button stays, switched off
                  <button className="btn btn--sm btn--ghost plan__soon" disabled>
                    <span>Coming soon</span>
                  </button>
                ) : (
                  <Link
                    className={`btn btn--sm ${id === "free" ? "btn--ghost" : "btn--glow"}`}
                    href={id === "free" ? (open ? "/app" : "/alerts") : "/app#billing"}
                  >
                    <span>{id === "free" ? "Start free" : `Get ${plan.name}`}</span>
                  </Link>
                )}
              </article>
            );
          })}
        </div>
        <div className="plans__notes">
          <h2 className="h3">{open ? "How paying works" : "How paying will work"}</h2>
          <ul>
            <li>Sign in with your Solana wallet. No email or password is needed.</li>
            <li>
              Each invoice has a unique amount (the last digits identify it). Pay from your wallet in one click, with
              any Solana Pay wallet, or send it from an exchange and paste the transaction signature.
            </li>
            <li>The plan switches on as soon as the payment confirms. 12 months costs the price of 10.</li>
            <li>When a plan ends, the account returns to Free. HIGH and CRITICAL alerts never stop.</li>
            <li>
              Grades never depend on who pays. A protocol that buys a plan gets the same grade as one that does not.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
