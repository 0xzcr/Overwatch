import Link from "next/link";
import { layers, steps, MAINTENANCE_NOTICE } from "@/site/content";
import { visual } from "@/site/visuals";
import { AsciiEye } from "@/site/AsciiEye";
import { Vis, cssVars, JsonLd, ORGANIZATION_ID } from "@/site/ui"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component
import { loadEvents, type FeedItem } from "@/site/data";
import { ago } from "@/lib/format";

// Cached and rebuilt in the background at most every 30 s, like the other data pages.
export const revalidate = 30;

/** One pass of the ticker's items. The ticker shows it twice in a row so the loop has no seam. */
function TickerItems({ events, hidden }: { events: FeedItem[]; hidden?: boolean }) {
  return (
    <ul className="ticker__run" aria-hidden={hidden}>
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/protocols/${e.slug}`}
            className={`ticker__item sev-${e.severity.toLowerCase()}`}
            tabIndex={hidden ? -1 : undefined}
          >
            <i className="ticker__sev" />
            <span className="ticker__text">{e.title}</span>
            <time className="mono" dateTime={e.blockTime ?? e.detectedAt}>
              {ago(e.blockTime ?? e.detectedAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One span per character, so scrolling can select the title a letter at a time (see `.ch` in engine/page.ts). */
const chars = (text: string) =>
  [...text].map((c, i) => (
    <span key={i} className="ch">
      {c}
    </span>
  ));

export default async function Home() {
  const { events } = await loadEvents(14);

  return (
    <>
      <JsonLd // SEO component
        data={{
          // SEO component
          "@type": "WebApplication", // SEO component
          name: "Overwatch", // SEO component
          url: SITE_URL, // SEO component
          applicationCategory: "SecurityApplication", // SEO component
          operatingSystem: "Web", // SEO component
          // SEO component
          description:
            "Early warning for Solana DeFi depositors: Overwatch grades every way a protocol could be drained by the keys an attacker must steal and the time you would have to withdraw, and alerts you when that gets worse.", // SEO component
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, // SEO component
          publisher: { "@id": ORGANIZATION_ID }, // SEO component
        }} // SEO component
      />
      {/* SEO component */}
      {/* HERO: the eye is a text canvas */}
      <section className="hero hero--solo wd" id="top" data-dock="Intro">
        <div className="wd__eye">
          <AsciiEye />
        </div>
        <div className="hero__title-wrap wd__text">
          <p className="wd__kicker mono"></p>
          <h1 className="hero__title hero__title--watchdog wd__title" aria-label="The Protocol Watchdog">
            <span className="hero__line">
              <span>{chars("The Protocol")}</span>
            </span>
            <span className="hero__line">
              <span className="wd__accent">{chars("Watchdog")}</span>
            </span>
          </h1>
          <p className="wd__sub">
            Overwatch tells you how many keys it would take to drain each Solana protocol holding your money, and how
            long you would have to get out. When either gets worse, you hear first.
          </p>
        </div>
      </section>

      {MAINTENANCE_NOTICE && (
        <div className="page-block notice-band">
          <p className="notice mono">
            <span className="badge badge--warn">maintenance</span> {MAINTENANCE_NOTICE}
          </p>
        </div>
      )}

      {/* HOW IT WORKS */}
      <section className="sec" id="how" data-dock="How it works">
        <header className="section-head">
          <h2 className="h2">How it works</h2>
        </header>
        <ol className="steps" aria-label="How it works">
          {steps.map((s) => (
            <li key={s.num} className="step">
              <span className="step__num mono">{s.num}</span>
              <h3 className="step__name">{s.name}</h3>
              <p className="step__title">{s.title}</p>
              <p className="step__text">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PRODUCT LAYERS */}
      <section className="headliners sec" id="product" data-dock="Product">
        <div className="headliners__pin">
          <header className="headliners__head">
            <h2 className="h2">What you get</h2>
            <div className="headliners__progress">
              <i id="hlProg" />
            </div>
          </header>
          <div className="headliners__track" id="hlTrack">
            {layers.map((u) => (
              <Link key={u.id} href={u.href} className="hl" style={cssVars({ "--c": u.color })} data-cursor="Open">
                <div className="hl__copy">
                  <h3 className="hl__title">{u.title}</h3>
                  <p className="hl__sum">{u.summary}</p>
                  <span className="hl__more">{u.cta} →</span>
                </div>
                <Vis className="hl__vis" html={visual(u, u.color)} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta sec" id="cta" data-dock="Get started">
        <div className="cta__head">
          <h2 className="cta__title">Get started</h2>
        </div>
        <div className="paths">
          <Link className="path" href="/alerts" data-cursor="Start" style={cssVars({ "--c": "#FF5A3D" })}>
            <h3>Watch what you hold</h3>
            <p>Pick your protocols on Telegram, email or a webhook. You hear the moment their grade drops.</p>
            <span className="path__cta">Set up alerts →</span>
          </Link>
          <Link className="path" href="/docs#scoring" data-cursor="Read" style={cssVars({ "--c": "#8B7CFF" })}>
            <h3>Check a protocol&apos;s grade</h3>
            <p>
              Every grade shows the control that sets it: keys to steal and days to react. The fix is almost always a
              longer timelock or more signers.
            </p>
            <span className="path__cta">How grades work →</span>
          </Link>
          <Link className="path" href="/pricing" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
            <h3>For teams, funds and builders</h3>
            <p>Signed webhooks, API keys, and private watches of your own programs and multisigs. Paid in USDC.</p>
            <span className="path__cta">See plans →</span>
          </Link>
        </div>
      </section>

      {/* Fixed along the bottom of the landing page: recent control changes, moving right to left. */}
      {events.length > 0 && (
        <aside className="ticker" aria-label="Recent changes in protocols">
          <Link href="/events" className="ticker__label">
            <span className="dot dot--live" />
            Recent changes
          </Link>
          <div className="ticker__window">
            <div className="ticker__track" style={{ animationDuration: `${events.length * 7}s` }}>
              <TickerItems events={events} />
              <TickerItems events={events} hidden />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
