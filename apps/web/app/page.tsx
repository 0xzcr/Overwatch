import Link from "next/link";
import { layers, steps } from "@/site/content";
import { loadProtocols } from "@/site/data";
import { visual } from "@/site/visuals";
import { Glyph } from "@/site/Glyph";
import { Grade, Vis, cssVars, stage } from "@/site/ui";
import { ProtoRow } from "@/site/ProtoRow";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { cards, headline: h } = await loadProtocols();

  return (
    <>
      {/* HERO */}
      <section className="hero hero--solo" id="top" data-dock="Intro" {...stage("orb", { colorA: "#2BFFB0", colorB: "#3a5cff", hud: true, y: 0.45, yNarrow: 0.9, front: true, sway: 0.18 })}>
        <div className="hero__title-wrap">
          <p className="hero__eyebrow mono">
            <span data-scramble>OVERWATCH</span>
          </p>
          <h1 className="hero__title hero__title--watchdog" aria-label="The Protocol Watchdog">
            <span className="hero__line">
              <span className="hero__the">The</span>
            </span>
            <span className="hero__line">
              <span className="hero__edition">Protocol</span>
            </span>
            <span className="hero__line">
              <span className="hero__vigil hero__watchdog">Watchdog</span>
            </span>
          </h1>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="tiles" id="how" data-dock="How it works" {...stage("scatter", { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.5 })}>
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
        className="headliners"
        id="product"
        data-dock="Product"
        {...stage("terrain", { colorA: "#5AA8FF", colorB: "#2BFFB0", opacity: 0.45, y: -1.2, scale: 1.3, autoRotate: 0.02 })}
      >
        <div className="headliners__pin">
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

      {/* CONTROL MAP PREVIEW */}
      <section
        className="cmap"
        id="control-map"
        data-dock="Control map"
        {...stage("globe", { colorA: "#2BFFB0", colorB: "#1d6bff", opacity: 1, x: 2.9, y: 1.05, scale: 0.78, arcs: true, autoRotate: 0.07, tiltX: 0.3 })}
      >
        <header className="section-head">
          <h2 className="h2">
            Control map
          </h2>
          <p className="section-head__lede">
            Graded A to F on who can change them. <Grade grade="A" score={85} size="sm" /> means strong controls; red means a vault reading the Overwatch registry should
            exit.
          </p>
        </header>
        <ol className="protos">
          {cards.slice(0, 6).map((p) => (
            <ProtoRow key={p.slug} p={p} />
          ))}
        </ol>
        <div className="cmap__more">
          <Link href="/protocols" className="btn btn--ghost" data-cursor="Open">
            <span>All {h.total} protocols</span>
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section
        className="cta"
        id="cta"
        data-dock="Get started"
        {...stage("wordmark", { colorA: "#2BFFB0", colorB: "#7CF3FF", y: 1.55, yNarrow: 1.9, scale: 0.95, narrowScale: 0.5, opacity: 1, front: true, sway: 0.12 })}
      >
        <div className="cta__head">
          <h2 className="cta__title">
            Start watching
          </h2>
        </div>
        <div className="paths">
          <Link className="path" href="/alerts" data-cursor="Alerts" style={cssVars({ "--c": "#FF5A3D" })}>
            <h3>Protect your deposits</h3>
            <p>Watch the protocols you use and get a plain-English alert the moment their locks get weaker.</p>
            <span className="path__cta">Set up alerts →</span>
          </Link>
          <Link className="path" href="/methodology" data-cursor="Read" style={cssVars({ "--c": "#8B7CFF" })}>
            <h3>Raise your grade</h3>
            <p>Run a protocol? Every deduction is public and fixable: add a timelock, raise the threshold, retire the single key.</p>
            <span className="path__cta">Read the methodology →</span>
          </Link>
          <Link className="path" href="/docs/api" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
            <h3>Build on the watch</h3>
            <p>Read RiskRecords from your program, stream events into your risk desk, or verify webhooks in one call.</p>
            <span className="path__cta">API &amp; SDK →</span>
          </Link>
        </div>
      </section>
    </>
  );
}
