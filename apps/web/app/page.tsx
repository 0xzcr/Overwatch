import Link from "next/link";
import { eventTypes, layers, manifesto, steps } from "@/site/content";
import { loadEvents, loadProtocols, SNAPSHOT_LABEL } from "@/site/data";
import { visual } from "@/site/visuals";
import { Glyph } from "@/site/Glyph";
import { Grade, Term, Vis, cssVars, stage } from "@/site/ui";
import { ProtoRow } from "@/site/ProtoRow";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ live, cards, headline: h }, feed] = await Promise.all([loadProtocols(), loadEvents(24, "MEDIUM")]);
  const ticker = feed.events.length
    ? feed.events.map((e) => ({ k: `${e.id}`, sev: e.severity.toLowerCase(), text: `${e.name}: ${e.title}` }))
    : eventTypes.map((t) => ({ k: t, sev: "type", text: t }));
  const source = live ? "live from mainnet" : SNAPSHOT_LABEL;

  return (
    <>
      {/* HERO */}
      <section className="hero" id="top" data-dock="Intro" {...stage("orb", { colorA: "#2BFFB0", colorB: "#3a5cff", hud: true, y: 0.45, yNarrow: 0.9, front: true, sway: 0.18 })}>
        <div className="hud hud--tl mono">
          <span>[ OVERWATCH / SOLANA ]</span>
          <span className="hud__dim">Watching on behalf of depositors · mainnet, read-only</span>
        </div>
        <div className="hud hud--tr mono">
          <span>
            SLOT <b data-slot>—</b>
          </span>
          <span className="hud__dim">
            TGT <b id="tgt">+0.000 / +0.000</b>
          </span>
        </div>
        <div className="hud hud--bl mono">
          <span className="dot dot--live" /> Watching {h.total} protocols · {h.tvl}
        </div>

        <div className="hero__title-wrap">
          <p className="hero__eyebrow mono">
            <span data-scramble>Overwatch</span> <span className="hero__eyebrow-sep">—</span> <span data-scramble>Solana DeFi early warning</span>
          </p>
          <h1 className="hero__title" aria-label="Know who can move your money.">
            <span className="hero__line">
              <span className="hero__the">Know who can</span>
            </span>
            <span className="hero__line">
              <span className="hero__vigil serif">move</span>
            </span>
            <span className="hero__line">
              <span className="hero__edition">your money.</span>
            </span>
          </h1>
        </div>

        <div className="hero__aside">
          <p className="hero__stat">
            <b className="mono">
              {h.lowNoDelay} of the top {h.total}
            </b>{" "}
            Solana protocols can be changed by ≤2 people with no delay.
          </p>
          <p className="hero__lede">
            Overwatch is a smoke detector for DeFi. It goes off when someone removes the safety locks, before the fire starts.{" "}
            <span className="mono hero__src">{source}</span>
          </p>
          <div className="hero__ctas">
            <Link href="/protocols" className="btn btn--glow" data-cursor="Open">
              <span>See the control map</span>
              <span className="btn__arrow btn__arrow--side">→</span>
            </Link>
            <Link href="/case/drift" className="btn btn--ghost" data-cursor="Replay">
              <span>Drift: 9 days of warning</span>
            </Link>
          </div>
        </div>

        <div className="hero__scroll mono" aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </section>

      {/* LIVE EVENT TICKER */}
      <div className="marquee" aria-label={feed.events.length ? "Latest events" : "Events the rules engine detects"}>
        <div className="marquee__track">
          {[0, 1].map((k) => (
            <div className="marquee__group" key={k} aria-hidden={k === 1}>
              {!feed.events.length && <span className="marquee__item mono marquee__lead">Detects</span>}
              {ticker.map((t) => (
                <span key={t.k} className={`marquee__item mono sev-${t.sev}`}>
                  <i /> {t.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* WHY */}
      <section className="manifesto" id="why" data-dock="Why" {...stage("scatter", { colorA: "#7CF3FF", colorB: "#2a2f5a", opacity: 0.55, autoRotate: 0.03 })}>
        <div className="manifesto__pin">
          <p className="label mono">[ Why Overwatch exists ]</p>
          <p className="manifesto__text">
            {manifesto.split(" ").map((w, i) => (
              <span className={`w${/\$285M|nine|Nobody|locks\./.test(w) ? " w--hot" : ""}`} key={i}>
                {w}{" "}
              </span>
            ))}
          </p>
          <div className="manifesto__sig mono">
            <span>Existing monitors serve protocol teams. Overwatch watches on behalf of depositors.</span>
            <Link href="/case/drift" className="hud__dim">
              Sources: public incident reports →
            </Link>
          </div>
        </div>
      </section>

      {/* NUMBERS */}
      <section
        className="stats"
        id="numbers"
        data-dock="The locks"
        {...stage("lattice", { colorA: "#7CF3FF", colorB: "#8B7CFF", opacity: 0.75, x: 3.2, y: 0.9, scale: 0.85, autoRotate: 0.14, tiltX: 0.2 })}
      >
        <header className="section-head">
          <p className="label mono">[ The state of the locks · {source} ]</p>
          <h2 className="h2">
            {h.total} protocols. <span className="serif">{h.tvl}</span> in deposits.
            <br />
            Here is who holds the keys.
          </h2>
        </header>
        <div className="stats__grid">
          <div className="stat" style={cssVars({ "--c": "#FF5A3D" })}>
            <b className="stat__num mono" data-count={h.noTimelock}>
              {h.noTimelock}
            </b>
            <span className="stat__label">
              <Term t="multisig">multisigs</Term> with no <Term t="timelock" />
            </span>
            <span className="stat__sub mono">{h.noTimelockTvl} in deposits can be changed instantly</span>
          </div>
          <div className="stat" style={cssVars({ "--c": "#FFB547" })}>
            <b className="stat__num mono" data-count={h.shortTimelock}>
              {h.shortTimelock}
            </b>
            <span className="stat__label">timelocks under 24 hours</span>
            <span className="stat__sub mono">less than a day to react to a bad change</span>
          </div>
          <div className="stat" style={cssVars({ "--c": "#FF5A3D" })}>
            <b className="stat__num mono" data-count={h.singleKey}>
              {h.singleKey}
            </b>
            <span className="stat__label">
              <Term t="upgrade authority">upgradeable</Term> by a single private key
            </span>
            <span className="stat__sub mono">one stolen key replaces the code</span>
          </div>
          <div className="stat" style={cssVars({ "--c": "#8B7CFF" })}>
            <b className="stat__num mono" data-count={h.unmapped}>
              {h.unmapped}
            </b>
            <span className="stat__label">with control we can&apos;t fully map yet</span>
            <span className="stat__sub mono">unknown is not the same as safe</span>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="tiles" id="how" data-dock="How it works" {...stage("scatter", { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.5 })}>
        <header className="section-head">
          <p className="label mono">[ How it works ]</p>
          <h2 className="h2">
            Map. Watch. <span className="serif">Warn.</span>
          </h2>
        </header>
        <div className="tiles__grid">
          {steps.map((s) => (
            <div key={s.num} className="tile" data-shape={s.shape} data-color={s.color} style={cssVars({ "--c": s.color })}>
              <span className="tile__glow" />
              <Glyph shape={s.shape} />
              <span className="tile__top mono">
                <span>{s.num}</span>
              </span>
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
            <p className="label mono">[ The product ]</p>
            <h2 className="h2">
              Three layers.
              <br />
              <span className="serif">One alarm.</span>
            </h2>
            <div className="headliners__progress">
              <i id="hlProg" />
            </div>
          </header>
          <div className="headliners__track" id="hlTrack">
            {layers.map((u) => (
              <Link key={u.id} href={u.href} className="hl" style={cssVars({ "--c": u.color })} data-cursor="Open">
                <div className="hl__copy">
                  <p className="hl__meta mono">
                    <span>{u.code}</span>
                  </p>
                  <h3 className="hl__title">{u.title}</h3>
                  <p className="hl__sum">{u.summary}</p>
                  <span className="hl__more mono">{u.cta} →</span>
                </div>
                <Vis className="hl__vis" html={visual(u, u.color)} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DRIFT */}
      <section
        className="drift-cta"
        id="drift"
        data-dock="Drift"
        data-dock-color="#FF5A3D"
        {...stage("knot", { colorA: "#FFB547", colorB: "#1b2340", x: 3, y: 0.2, scale: 0.8, autoRotate: 0.16, jitter: 0.02, opacity: 0.95 })}
      >
        <Link href="/case/drift" className="drift-cta__card" data-tilt data-cursor="Replay">
          <p className="label mono label--bad">[ Case study · reconstructed from public incident reports ]</p>
          <h2 className="h2">
            Drift lost <span className="serif bad">$285M</span> in 12 minutes.
            <br />
            The warning signs were onchain <span className="serif">9 days</span> earlier.
          </h2>
          <span className="drift-cta__go mono">Replay the alerts Overwatch would have sent →</span>
        </Link>
      </section>

      {/* CONTROL MAP PREVIEW */}
      <section
        className="cmap"
        id="control-map"
        data-dock="Control map"
        {...stage("globe", { colorA: "#2BFFB0", colorB: "#1d6bff", opacity: 1, x: 2.9, y: 1.05, scale: 0.78, arcs: true, autoRotate: 0.07, tiltX: 0.3 })}
      >
        <header className="section-head">
          <p className="label mono">[ The control map · {source} ]</p>
          <h2 className="h2">
            Every grade,
            <br />
            <span className="serif">with receipts.</span>
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
          <p className="label mono">[ Your move ]</p>
          <h2 className="cta__title">
            Stand <span className="serif">watch.</span>
          </h2>
        </div>
        <div className="paths">
          <Link className="path" href="/alerts" data-cursor="Alerts" style={cssVars({ "--c": "#FF5A3D" })}>
            <span className="path__num mono">A</span>
            <h3>Protect your deposits</h3>
            <p>Watch the protocols you use and get a plain-English alert the moment their locks get weaker.</p>
            <span className="path__cta mono">Set up alerts →</span>
          </Link>
          <Link className="path" href="/methodology" data-cursor="Read" style={cssVars({ "--c": "#8B7CFF" })}>
            <span className="path__num mono">B</span>
            <h3>Raise your grade</h3>
            <p>Run a protocol? Every deduction is public and fixable: add a timelock, raise the threshold, retire the single key.</p>
            <span className="path__cta mono">Read the methodology →</span>
          </Link>
          <Link className="path" href="/docs/api" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
            <span className="path__num mono">C</span>
            <h3>Build on the watch</h3>
            <p>Read RiskRecords from your program, stream events into your risk desk, or verify webhooks in one call.</p>
            <span className="path__cta mono">API &amp; SDK →</span>
          </Link>
        </div>
      </section>
    </>
  );
}
