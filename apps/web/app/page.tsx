import Link from "next/link";
import { layers, steps, MAINTENANCE_NOTICE } from "@/site/content";
import { visual } from "@/site/visuals";
import { AsciiEye } from "@/site/AsciiEye";
import { Vis, cssVars, stage } from "@/site/ui";

/** One span per character, so scrolling can select the title a letter at a time (see `.ch` in engine/page.ts). */
const chars = (text: string) =>
  [...text].map((c, i) => (
    <span key={i} className="ch">
      {c}
    </span>
  ));

export default function Home() {
  return (
    <>
      {/* HERO: the particle stage stays hidden here; the eye is the text canvas */}
      <section
        className="hero hero--solo wd"
        id="top"
        data-dock="Intro"
        {...stage("orb", { colorA: "#2BFFB0", colorB: "#3a5cff", opacity: 0, front: true, sway: 0 })}
      >
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
            Overwatch reads who can change the Solana protocols holding your deposits, and tells you when those controls
            get weaker.
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
      <section
        className="sec"
        id="how"
        data-dock="How it works"
        {...stage("scatter", { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.35 })}
      >
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
      <section
        className="headliners sec"
        id="product"
        data-dock="Product"
        {...stage("terrain", {
          colorA: "#5AA8FF",
          colorB: "#2BFFB0",
          opacity: 0.35,
          y: -1.2,
          scale: 1.3,
          autoRotate: 0.02,
        })}
      >
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
      <section
        className="cta sec"
        id="cta"
        data-dock="Get started"
        {...stage("wordmark", {
          colorA: "#2BFFB0",
          colorB: "#7CF3FF",
          y: 1.55,
          yNarrow: 1.9,
          scale: 0.95,
          narrowScale: 0.5,
          opacity: 0.8,
          front: true,
          sway: 0.12,
        })}
      >
        <div className="cta__head">
          <h2 className="cta__title">Get started</h2>
        </div>
        <div className="paths">
          <Link className="path" href="/alerts" data-cursor="Alerts" style={cssVars({ "--c": "#FF5A3D" })}>
            <h3>Get alerts for your protocols</h3>
            <p>Pick the protocols you use. You get a message when their controls get weaker.</p>
            <span className="path__cta">Set up alerts →</span>
          </Link>
          <Link className="path" href="/docs#scoring" data-cursor="Read" style={cssVars({ "--c": "#8B7CFF" })}>
            <h3>Check a protocol&apos;s grade</h3>
            <p>
              Every deduction is listed with its reason. Most fixes are a timelock, a higher threshold, or removing a
              single key.
            </p>
            <span className="path__cta">Read the documentation →</span>
          </Link>
          <Link className="path" href="/docs/api" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
            <h3>Use the data</h3>
            <p>
              Read risk records from your program, stream events into your own system, or verify webhook signatures.
            </p>
            <span className="path__cta">API &amp; SDK →</span>
          </Link>
        </div>
      </section>
    </>
  );
}
