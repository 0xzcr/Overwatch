import Link from "next/link";
import { layers, steps } from "@/site/content";
import { visual } from "@/site/visuals";
import { Glyph } from "@/site/Glyph";
import { Vis, cssVars, stage } from "@/site/ui";

/** One span per character, so scrolling can select the title a letter at a time (see `.ch` in engine/page.ts). */
const chars = (word: string) => [...word].map((c, i) => <span key={i} className="ch">{c}</span>);

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="hero hero--solo" id="top" data-dock="Intro" {...stage("orb", { colorA: "#2BFFB0", colorB: "#3a5cff", hud: true, scale: 0.55, narrowScale: 0.65, y: 0.2, yNarrow: 0.6, front: true, sway: 0 })}>
        <div className="hero__title-wrap">
          <p className="hero__eyebrow mono">
            <span data-scramble>OVERWATCH</span>
          </p>
          <h1 className="hero__title hero__title--watchdog" aria-label="The Protocol Watchdog">
            <span className="hero__line">
              <span className="hero__the">{chars("The")}</span>
            </span>
            <span className="hero__line">
              <span className="hero__edition">{chars("Protocol")}</span>
            </span>
            <span className="hero__line">
              <span className="hero__vigil hero__watchdog">{chars("Watchdog")}</span>
            </span>
          </h1>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="tiles sec sec--1" id="how" data-dock="How it works" {...stage("scatter", { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.5 })}>
        <p className="sec-label mono">01 · How it works</p>
        <header className="section-head">
          <h2 className="h2">
            How it works
          </h2>
        </header>
        <div className="tiles__grid">
          {steps.map((s) => (
            <div key={s.num} className="tile" data-shape={s.shape} data-color={s.color} style={cssVars({ "--c": s.color })}>
              <span className="tile__glow" />
              <Glyph shape={s.shape} />
              <span className="tile__name">{s.name}</span>
              <span className="tile__title">{s.title}</span>
              <span className="tile__text">{s.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUCT LAYERS */}
      <section
        className="headliners sec sec--2"
        id="product"
        data-dock="Product"
        {...stage("terrain", { colorA: "#5AA8FF", colorB: "#2BFFB0", opacity: 0.45, y: -1.2, scale: 1.3, autoRotate: 0.02 })}
      >
        <div className="headliners__pin">
          <p className="sec-label mono">02 · The product</p>
          <header className="headliners__head">
            <h2 className="h2">
              What you get
            </h2>
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
        className="cta sec sec--4"
        id="cta"
        data-dock="Get started"
        {...stage("wordmark", { colorA: "#2BFFB0", colorB: "#7CF3FF", y: 1.55, yNarrow: 1.9, scale: 0.95, narrowScale: 0.5, opacity: 1, front: true, sway: 0.12 })}
      >
        <p className="sec-label mono">03 · Next steps</p>
        <div className="cta__head">
          <h2 className="cta__title">
            Get started
          </h2>
        </div>
        <div className="paths">
          <Link className="path" href="/alerts" data-cursor="Alerts" style={cssVars({ "--c": "#FF5A3D" })}>
            <h3>Get alerts for your protocols</h3>
            <p>Pick the protocols you use. You get a message when their controls get weaker.</p>
            <span className="path__cta">Set up alerts →</span>
          </Link>
          <Link className="path" href="/docs#scoring" data-cursor="Read" style={cssVars({ "--c": "#8B7CFF" })}>
            <h3>Check a protocol's grade</h3>
            <p>Every deduction is listed with its reason. Most fixes are a timelock, a higher threshold, or removing a single key.</p>
            <span className="path__cta">Read the documentation →</span>
          </Link>
          <Link className="path" href="/docs/api" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
            <h3>Use the data</h3>
            <p>Read risk records from your program, stream events into your own system, or verify webhook signatures.</p>
            <span className="path__cta">API &amp; SDK →</span>
          </Link>
        </div>
      </section>
    </>
  );
}
