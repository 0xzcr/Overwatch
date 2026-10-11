import type { CSSProperties } from "react";
import { capabilities, chapters, chapterById, edition, eventTypes, manifesto } from "./content";
import { visual } from "./visuals";
import type { SiteData } from "./data";
import { Experience } from "./Experience";
import { Glyph } from "./Glyph";

const cssVars = (v: Record<string, string>) => v as CSSProperties;
const GRADE_WORD: Record<string, string> = { A: "Strong", B: "Good", C: "Caution", D: "Weak", F: "Dangerous" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Mark({ className = "logo-mark" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <use href="#ow-mark" />
    </svg>
  );
}

function Vis({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Site({ data }: { data: SiteData }) {
  const featured = capabilities.filter((c) => c.featured);
  const s = data.stats;
  const drift = data.drift;
  const payload = {
    capabilities,
    chapters,
    protocols: data.protocols,
    drift,
    warningDays: data.warningDays,
    live: data.live,
  };

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      {/* BOOT */}
      <div className="boot" id="boot" aria-hidden="true">
        <div className="boot__grid" />
        <div className="boot__inner">
          <Mark className="logo-mark logo-mark--boot" />
          <ol className="boot__log" id="bootLog" />
        </div>
        <div className="boot__foot">
          <span className="mono">OVERWATCH // VIGIL BUILD 26.10</span>
          <span className="boot__pct mono" id="bootPct">
            000
          </span>
        </div>
        <div className="boot__bar">
          <i id="bootBar" />
        </div>
      </div>

      <canvas className="stage" id="stage" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="gridlines" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="cursor" id="cursor" aria-hidden="true">
        <div className="cursor__ring">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="cursor__dot" />
        <div className="cursor__label" id="cursorLabel" />
      </div>

      {/* NAV */}
      <header className="nav" id="nav">
        <a href="#top" className="nav__brand" data-cursor="Top" aria-label="Overwatch, back to top">
          <Mark />
          <span className="nav__word">OVERWATCH</span>
          <span className="nav__sub mono">Editions</span>
        </a>
        <div className="nav__edition mono">
          <span className="dot dot--live" />
          <span>{edition.season}</span>
          <span className="nav__sep">/</span>
          <span className="nav__ed">{edition.name}</span>
        </div>
        <nav className="nav__actions" aria-label="Primary">
          <button className="nav__link" id="menuOpen" data-cursor="Explore" aria-expanded="false" aria-controls="menu">
            <span>Explore</span>
            <span className="nav__burger">
              <i />
              <i />
            </span>
          </button>
          <a className="nav__link nav__link--hide-sm" href="#control-map" data-cursor="Grades">
            Control map
          </a>
          <a className="btn btn--glow btn--sm" href="#cta" data-cursor="Join">
            <span>Stand watch</span>
          </a>
        </nav>
      </header>

      {/* MENU */}
      <div className="menu" id="menu" aria-hidden="true" role="dialog" aria-label="Explore the Edition">
        <div className="menu__bg" />
        <div className="menu__inner">
          <div className="menu__head mono">
            <span>[ Index of chapters ]</span>
            <button className="menu__close" id="menuClose" data-cursor="Close" aria-label="Close menu">
              Close <span>✕</span>
            </button>
          </div>
          <ol className="menu__list">
            {chapters.map((c) => (
              <li key={c.id} style={cssVars({ "--c": c.color })}>
                <a href={`#${c.id}`} data-shape={c.shape} data-color={c.color} data-cursor="Go">
                  <span className="mono menu__num">{c.num}</span>
                  <span className="menu__name">{c.name}</span>
                  <span className="menu__kicker mono">{c.kicker}</span>
                  <span className="menu__count mono">{capabilities.filter((x) => x.chapter === c.id).length}</span>
                </a>
              </li>
            ))}
            <li style={cssVars({ "--c": "#FF5A3D" })}>
              <a href="#drift" data-shape="knot" data-color="#FF5A3D" data-cursor="Go">
                <span className="mono menu__num">07</span>
                <span className="menu__name">Drift</span>
                <span className="menu__kicker mono">Case study · 9 days of warning</span>
                <span className="menu__count mono">5</span>
              </a>
            </li>
            <li style={cssVars({ "--c": "#2BFFB0" })}>
              <a href="#control-map" data-shape="globe" data-color="#2BFFB0" data-cursor="Go">
                <span className="mono menu__num">08</span>
                <span className="menu__name">Control map</span>
                <span className="menu__kicker mono">Live grades · {s.total} protocols</span>
                <span className="menu__count mono">{s.total}</span>
              </a>
            </li>
          </ol>
          <div className="menu__foot mono">
            <span>Hover a chapter to preview it on the stage</span>
            <a href="#index" className="menu__all">
              Browse all {capabilities.length} capabilities →
            </a>
          </div>
        </div>
      </div>

      {/* DOCK */}
      <div className="dock" id="dock" aria-label="Chapter navigation">
        <button className="dock__btn" id="dockPrev" aria-label="Previous chapter" data-cursor="Prev">
          ←
        </button>
        <a className="dock__now" href="#chapters" data-cursor="Chapters">
          <svg className="dock__ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" />
            <circle id="dockProg" cx="18" cy="18" r="15.5" />
          </svg>
          <span className="mono dock__num" id="dockNum">
            00
          </span>
          <span className="dock__name" id="dockName">
            Intro
          </span>
        </a>
        <button className="dock__btn" id="dockNext" aria-label="Next chapter" data-cursor="Next">
          →
        </button>
      </div>

      <main id="main">
        {/* HERO */}
        <section className="hero" id="top" data-stage="hero">
          <div className="hud hud--tl mono">
            <span>[ OW·EDITIONS / FALL &apos;26 ]</span>
            <span className="hud__dim">Public watch over Solana DeFi · mainnet, read-only</span>
          </div>
          <div className="hud hud--tr mono">
            <span>
              EST. SLOT <b id="slot">—</b>
            </span>
            <span className="hud__dim">
              TGT <b id="tgt">+0.000 / +0.000</b>
            </span>
          </div>
          <div className="hud hud--bl mono">
            <span className="dot dot--live" /> Watching {s.total} protocols · {s.tvl}
          </div>

          <div className="hero__title-wrap">
            <p className="hero__eyebrow mono">
              <span data-scramble>Overwatch Editions</span> <span className="hero__eyebrow-sep">—</span> <span data-scramble>Fall 2026</span>
            </p>
            <h1 className="hero__title" aria-label={edition.name}>
              <span className="hero__line">
                <span className="hero__the">The</span>
              </span>
              <span className="hero__line">
                <span className="hero__vigil serif">Vigil</span>
              </span>
              <span className="hero__line">
                <span className="hero__edition">Edition</span>
              </span>
            </h1>
          </div>

          <div className="hero__aside">
            <p className="hero__promise">{edition.promise}</p>
            <p className="hero__lede">
              Overwatch is a smoke detector for Solana DeFi. We map who can change the protocols holding <strong>{s.tvl}</strong>, watch every key and signer, and
              warn you, and your vault, the moment those locks get weaker.
            </p>
            <div className="hero__ctas">
              <a href="#chapters" className="btn btn--glow" data-cursor="Explore">
                <span>Explore the Edition</span>
                <span className="btn__arrow">↓</span>
              </a>
              <a href="#drift" className="btn btn--ghost" data-cursor="Replay">
                <span>Drift: 9 days of warning</span>
              </a>
            </div>
          </div>

          <div className="hero__scroll mono" aria-hidden="true">
            <span>Scroll to begin the watch</span>
            <i />
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee" aria-label="Events the rules engine detects">
          <div className="marquee__track">
            {[0, 1].map((k) => (
              <div className="marquee__group" key={k} aria-hidden={k === 1}>
                {eventTypes.map((t) => (
                  <span key={t} className="marquee__item mono">
                    <i /> {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* MANIFESTO */}
        <section className="manifesto" id="manifesto" data-stage="manifesto">
          <div className="manifesto__pin">
            <p className="label mono">[ 00 · Why a vigil ]</p>
            <p className="manifesto__text" id="manifestoText">
              {manifesto.split(" ").map((w, i) => (
                <span className={`w${/\$285M|nine|Nobody|locks\./.test(w) ? " w--hot" : ""}`} key={i}>
                  {w}{" "}
                </span>
              ))}
            </p>
            <div className="manifesto__sig mono">
              <span>— The Overwatch team</span>
              <span className="hud__dim">Source: public incident reports, Apr 2026</span>
            </div>
          </div>
        </section>

        {/* NUMBERS */}
        <section className="stats" id="numbers" data-stage="stats">
          <header className="section-head">
            <p className="label mono">
              [ The state of the locks · {data.live ? "live from mainnet" : "mainnet snapshot, Oct 11 2026"} ]
            </p>
            <h2 className="h2">
              {s.total} protocols. <span className="serif">{s.tvl}</span> in deposits.
              <br />
              Here is who holds the keys.
            </h2>
          </header>
          <div className="stats__grid">
            <div className="stat" style={cssVars({ "--c": "#FF5A3D" })}>
              <b className="stat__num mono" data-count={s.noTimelock}>
                {s.noTimelock}
              </b>
              <span className="stat__label">multisigs with no timelock</span>
              <span className="stat__sub mono">{s.noTimelockTvl} in deposits can be changed instantly</span>
            </div>
            <div className="stat" style={cssVars({ "--c": "#FFB547" })}>
              <b className="stat__num mono" data-count={s.shortTimelock}>
                {s.shortTimelock}
              </b>
              <span className="stat__label">timelocks under 24 hours</span>
              <span className="stat__sub mono">less than a day to react to a bad change</span>
            </div>
            <div className="stat" style={cssVars({ "--c": "#FF5A3D" })}>
              <b className="stat__num mono" data-count={s.singleKey}>
                {s.singleKey}
              </b>
              <span className="stat__label">upgradeable by a single private key</span>
              <span className="stat__sub mono">one stolen key replaces the code</span>
            </div>
            <div className="stat" style={cssVars({ "--c": "#8B7CFF" })}>
              <b className="stat__num mono" data-count={s.unmapped}>
                {s.unmapped}
              </b>
              <span className="stat__label">with control we can&apos;t fully map yet</span>
              <span className="stat__sub mono">unknown is not the same as safe</span>
            </div>
          </div>
        </section>

        {/* CHAPTER TILES */}
        <section className="tiles" id="chapters" data-stage="tiles">
          <header className="section-head">
            <p className="label mono">[ What&apos;s inside ]</p>
            <h2 className="h2">
              Six chapters.
              <br />
              <span className="serif">One</span> vigil.
            </h2>
            <p className="section-head__lede">
              From the bytes of a ProgramData account to an exit transaction on a vault. Pick a chapter, or scroll the whole watch.
            </p>
          </header>
          <div className="tiles__grid">
            {chapters.map((c) => (
              <a key={c.id} className="tile" href={`#${c.id}`} data-shape={c.shape} data-color={c.color} data-cursor="Open" style={cssVars({ "--c": c.color })}>
                <span className="tile__glow" />
                <Glyph shape={c.shape} />
                <span className="tile__top mono">
                  <span>{c.num}</span>
                  <span>{capabilities.filter((x) => x.chapter === c.id).length} capabilities</span>
                </span>
                <span className="tile__name">{c.name}</span>
                <span className="tile__kicker mono">{c.kicker}</span>
                <span className="tile__title">{c.title}</span>
                <span className="tile__arrow">↗</span>
              </a>
            ))}
          </div>
        </section>

        {/* HEADLINERS */}
        <section className="headliners" id="headliners" data-stage="headliners">
          <div className="headliners__pin">
            <header className="headliners__head">
              <p className="label mono">[ Headliners ]</p>
              <h2 className="h2">
                The ones you&apos;ll
                <br />
                <span className="serif">hear about.</span>
              </h2>
              <div className="headliners__progress">
                <i id="hlProg" />
              </div>
            </header>
            <div className="headliners__track" id="hlTrack">
              {featured.map((u, i) => {
                const c = chapterById[u.chapter]!;
                return (
                  <article key={u.id} className="hl" style={cssVars({ "--c": c.color })} data-open={u.id} data-cursor="Open">
                    <div className="hl__copy">
                      <p className="hl__meta mono">
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          {c.name} · {u.code}
                        </span>
                        <span className={`tag tag--${u.tag.toLowerCase()}`}>{u.tag}</span>
                      </p>
                      <h3 className="hl__title">{u.title}</h3>
                      <p className="hl__sum">{u.summary}</p>
                      <span className="hl__more mono">Read more ↗</span>
                    </div>
                    <Vis className="hl__vis" html={visual(u, c.color)} />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* CHAPTERS */}
        {chapters.map((c) => {
          const items = capabilities.filter((x) => x.chapter === c.id);
          return (
            <section key={c.id} className="chapter" id={c.id} style={cssVars({ "--c": c.color })}>
              <div className="chapter__intro" data-stage={`chapter:${c.id}`} data-shape={c.shape} data-color={c.color}>
                <div className="chapter__copy">
                  <p className="chapter__label mono">
                    <span className="chapter__num">Chapter {c.num}</span>
                    <span className="chapter__line" />
                    <span>{c.kicker}</span>
                  </p>
                  <h2 className="chapter__name">{c.name}</h2>
                  <p className="chapter__title serif">{c.title}</p>
                  <p className="chapter__blurb">{c.blurb}</p>
                  <p className="chapter__count mono">
                    <span className="dot" style={{ background: c.color }} /> {items.length} capabilities in this chapter
                  </p>
                </div>
                <div className="chapter__hud mono" aria-hidden="true">
                  <span>{c.shape.toUpperCase()}.PTS</span>
                  <span>{c.num}/06</span>
                </div>
              </div>
              <div className="cards" data-stage={`grid:${c.id}`}>
                {items.map((u, i) => (
                  <article key={u.id} className={`card${u.featured ? " card--wide" : ""}`} data-open={u.id} data-cursor="Open" id={`cap-${u.id}`} style={cssVars({ "--i": String(i) })}>
                    <div className="card__corners" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <Vis className="card__vis" html={visual(u, c.color)} />
                    <div className="card__body">
                      <p className="card__meta mono">
                        <span>{u.code}</span>
                        <span className={`tag tag--${u.tag.toLowerCase()}`}>{u.tag}</span>
                      </p>
                      <h3 className="card__title">{u.title}</h3>
                      <p className="card__sum">{u.summary}</p>
                    </div>
                    <button className="card__open" aria-label={`Open ${u.title}`}>
                      +
                    </button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {/* DRIFT CASE */}
        <section className="drift" id="drift" data-stage="drift">
          <header className="section-head">
            <p className="label mono label--bad">[ Case study · reconstructed from public incident reports ]</p>
            <h2 className="h2">
              Drift lost <span className="serif bad">$285M</span>.<br />
              The warning signs were public <span className="serif">{data.warningDays} days</span> earlier.
            </h2>
            <p className="section-head__lede">
              No smart-contract bug was involved. The attacker collected pre-signed durable-nonce transactions from Security Council signers, waited, and used them
              to take admin. Step through the timeline: every alert below is produced by Overwatch&apos;s real rules engine, the same code that watches mainnet
              today, run on snapshots reconstructed from the reports.
            </p>
          </header>

          <div className="drift__board">
            <div className="drift__clock">
              <p className="mono label">days of warning</p>
              <p className="drift__days mono" id="driftDays">
                0.0
              </p>
              <p className="mono hud__dim" id="driftLeft">
                9.2 days until the drain
              </p>
              <div className="drift__grade">
                <span className="mono label">grade</span>
                <b id="driftGrade">{drift[0]?.grade}</b>
                <span className="mono" id="driftScore">
                  {drift[0]?.score}/100
                </span>
                <span className="mono drift__red" id="driftRed" hidden>
                  RED
                </span>
              </div>
            </div>

            <ol className="drift__steps" id="driftSteps">
              {drift.map((st, i) => (
                <li key={st.date} className={`drift__step lvl-${st.level}${i === 0 ? " is-on" : ""}`}>
                  <button data-step={i} data-cursor="Step">
                    <span className="mono">{fmtDate(st.date)}</span>
                    <b>{st.headline}</b>
                  </button>
                </li>
              ))}
            </ol>

            <div className="drift__detail" aria-live="polite" id="driftDetail">
              <p className="mono drift__date">{drift[0] ? new Date(drift[0].date).toUTCString() : ""}</p>
              <h3>{drift[0]?.headline}</h3>
              <p>{drift[0]?.detail}</p>
              <div className="drift__alerts" />
            </div>

            <div className="drift__controls mono">
              <button id="driftPrev" data-cursor="Prev">
                ← prev
              </button>
              <button id="driftPlay" data-cursor="Play">
                ▶ autoplay
              </button>
              <button id="driftNext" data-cursor="Next">
                next →
              </button>
            </div>
          </div>
          <details className="drift__sources mono">
            <summary>Sources and labelling</summary>
            <ul>
              {data.driftSources.map((x) => (
                <li key={x.url}>
                  <a href={x.url} target="_blank" rel="noreferrer">
                    {x.label} ↗
                  </a>
                </li>
              ))}
            </ul>
            <p>
              Reconstructed data: the reports do not publish full signer or nonce addresses, so these use placeholders (signer-A…F). Both councils are modelled as
              2-of-5 with no timelock, as the reports describe at the time of the attack. Drift&apos;s current council is watched live in the control map.
            </p>
          </details>
        </section>

        {/* CONTROL MAP */}
        <section className="cmap" id="control-map" data-stage="cmap">
          <header className="section-head section-head--row">
            <div>
              <p className="label mono">
                [ The control map · {data.live ? `live · ${new Date(data.at).toUTCString().slice(5, 22)} UTC` : "mainnet snapshot · Oct 11 2026"} ]
              </p>
              <h2 className="h2">
                Every grade,
                <br />
                <span className="serif">with receipts.</span>
              </h2>
            </div>
            <p className="section-head__lede">
              The {s.total} largest Solana protocols by deposits, graded A to F on who can change them. Open any protocol for its upgrade authority, multisig,
              timelock and every point it lost.
            </p>
          </header>
          <div className="filters" role="group" aria-label="Filter protocols">
            <div className="chips" id="gradeChips">
              {["All", "A", "B", "C", "D", "F"].map((g, i) => (
                <button key={g} className={`chip${i === 0 ? " is-on" : ""}`} data-grade={g} aria-pressed={i === 0}>
                  {g === "All" ? "All grades" : `${g} · ${GRADE_WORD[g]}`}
                </button>
              ))}
            </div>
          </div>
          <ol className="protos" id="protos">
            {data.protocols.map((p) => (
              <li key={p.slug} className={`proto g-${p.grade}${p.red ? " is-red" : ""}`} data-grade={p.grade} data-proto={p.slug} data-cursor="Inspect">
                <span className="proto__grade">
                  <b>{p.grade}</b>
                  <span className="mono">{p.score ?? "—"}</span>
                </span>
                <span className="proto__name">
                  <b>{p.name}</b>
                  <span className="mono">{p.category}</span>
                </span>
                <span className="proto__fact mono">
                  <span>authority</span>
                  {p.authority}
                </span>
                <span className="proto__fact mono">
                  <span>multisig</span>
                  {p.threshold}
                </span>
                <span className={`proto__fact mono${p.timelock === "no delay" ? " bad" : ""}`}>
                  <span>timelock</span>
                  {p.timelock}
                </span>
                <span className="proto__flags mono">
                  {p.flags.length ? p.flags.slice(0, 2).map((f) => <i key={f}>{f.replaceAll("_", " ").toLowerCase()}</i>) : <i className="ok">no flags</i>}
                </span>
                <span className="proto__go">↗</span>
              </li>
            ))}
          </ol>
          {data.feed.length > 0 && (
            <div className="feed">
              <div className="feed__head mono">
                <span>
                  <span className="dot dot--live" /> latest events
                </span>
                <span className="hud__dim">medium and above</span>
              </div>
              <ol className="feed__list">
                {data.feed.slice(0, 8).map((e, i) => (
                  <li key={i} className={`sev-${e.severity.toLowerCase()}`}>
                    <span className="mono">{e.severity}</span>
                    <b>{e.title}</b>
                    <time className="mono">{fmtDate(e.at)}</time>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* INDEX */}
        <section className="index" id="index" data-stage="index">
          <header className="section-head section-head--row">
            <div>
              <p className="label mono">[ Complete index ]</p>
              <h2 className="h2">
                Every capability,
                <br />
                <span className="serif">one place.</span>
              </h2>
            </div>
            <label className="search" data-cursor="Search">
              <span className="search__icon" aria-hidden="true">
                ⌕
              </span>
              <input id="search" type="search" placeholder="Search, e.g. “nonce” or “webhook”" autoComplete="off" aria-label="Search capabilities" />
              <kbd className="mono">/</kbd>
            </label>
          </header>
          <div className="filters">
            <div className="chips" id="chapterChips" role="group" aria-label="Filter by chapter">
              <button className="chip is-on" data-chapter="all" aria-pressed="true">
                All
              </button>
              {chapters.map((c) => (
                <button key={c.id} className="chip" data-chapter={c.id} aria-pressed="false" style={cssVars({ "--c": c.color })}>
                  <i style={{ background: c.color }} /> {c.name}
                </button>
              ))}
            </div>
            <div className="chips chips--tags" id="tagChips" role="group" aria-label="Filter by status">
              {(["Live", "Devnet", "Limited"] as const).map((t) => (
                <button key={t} className="chip chip--tag" data-tag={t} aria-pressed="false">
                  {t}
                </button>
              ))}
            </div>
            <div className="filters__meta mono">
              <span id="resultCount">
                Showing {capabilities.length} of {capabilities.length}
              </span>
              <div className="view-toggle" role="group" aria-label="View">
                <button className="is-on" data-view="list" aria-pressed="true">
                  List
                </button>
                <button data-view="grid" aria-pressed="false">
                  Grid
                </button>
              </div>
            </div>
          </div>
          <ol className="results" id="results" data-view="list">
            {capabilities.map((u) => {
              const c = chapterById[u.chapter]!;
              return (
                <li key={u.id} className="row" data-open={u.id} data-chapter={u.chapter} data-tag={u.tag} data-cursor="Open" style={cssVars({ "--c": c.color })}>
                  <span className="row__code mono">{u.code}</span>
                  <span className="row__title">{u.title}</span>
                  <span className="row__sum">{u.summary}</span>
                  <span className="row__ch mono">
                    <i style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <span className={`tag tag--${u.tag.toLowerCase()}`}>{u.tag}</span>
                  <span className="row__go">→</span>
                </li>
              );
            })}
          </ol>
          <p className="results__empty mono" id="resultsEmpty" hidden>
            Nothing matches. The watch continues; try another term.
          </p>
        </section>

        {/* CTA */}
        <section className="cta" id="cta" data-stage="cta">
          <div className="cta__head">
            <p className="label mono">[ Your move ]</p>
            <h2 className="cta__title">
              Stand <span className="serif">watch.</span>
            </h2>
            <p className="section-head__lede">Three ways in, whichever side of the deposit you are on.</p>
          </div>
          <div className="paths">
            <a className="path" href="#warn" data-cursor="Alerts" style={cssVars({ "--c": "#FF5A3D" })}>
              <span className="path__num mono">A</span>
              <h3>Protect your deposits</h3>
              <p>Watch the protocols you use and get a plain-English alert on Telegram, email or webhook the moment their locks get weaker.</p>
              <span className="path__cta mono">Set up alerts →</span>
            </a>
            <a className="path" href="#score" data-cursor="Grades" style={cssVars({ "--c": "#8B7CFF" })}>
              <span className="path__num mono">B</span>
              <h3>Raise your grade</h3>
              <p>Run a protocol? Every deduction is public and fixable: add a timelock, raise the threshold, retire the single key.</p>
              <span className="path__cta mono">Read the methodology →</span>
            </a>
            <a className="path" href="#build" data-cursor="Build" style={cssVars({ "--c": "#5AA8FF" })}>
              <span className="path__num mono">C</span>
              <h3>Build on the watch</h3>
              <p>Read RiskRecords from your program, stream events into your risk desk, or verify webhooks in one call.</p>
              <span className="path__cta mono">API &amp; SDK →</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__top">
          <div className="footer__brand">
            <Mark />
            <p>A smoke detector for Solana DeFi. We map who can move your money, and we tell you the moment those controls get weaker.</p>
            <p className="mono footer__status">
              <span className="dot dot--live" /> {data.live ? "Live data" : "Snapshot data"} · est. slot <b id="slotFoot">—</b>
            </p>
          </div>
          <div className="footer__cols">
            <div>
              <h4 className="mono">The watch</h4>
              <a href="#map">Map</a>
              <a href="#watch">Watch</a>
              <a href="#score">Score</a>
              <a href="#warn">Warn</a>
            </div>
            <div>
              <h4 className="mono">Onchain</h4>
              <a href="#act">Risk registry</a>
              <a href="#act">Shielded vault</a>
              <a href="#drift">Drift case study</a>
              <a href="#control-map">Control map</a>
            </div>
            <div>
              <h4 className="mono">Builders</h4>
              <a href="/api/v1/protocols">API: /protocols</a>
              <a href="/api/v1/status">API: /status</a>
              <a href="#build">SDK</a>
              <a href="#index">All capabilities</a>
            </div>
          </div>
        </div>
        <div className="footer__word" aria-hidden="true">
          OVERWATCH
        </div>
        <div className="footer__base mono">
          <span>© 2026 Overwatch</span>
          <span>Mainnet reads are read-only. Registry and vault run on devnet.</span>
          <a href="#top" data-cursor="Top">
            Back to top ↑
          </a>
        </div>
      </footer>

      {/* MODAL */}
      <div className="modal" id="modal" aria-hidden="true">
        <div className="modal__scrim" data-close />
        <article className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabIndex={-1}>
          <header className="modal__bar mono">
            <span className="modal__crumb" id="modalCrumb" />
            <div className="modal__nav">
              <button id="modalPrev" aria-label="Previous" data-cursor="Prev">
                ←
              </button>
              <span id="modalPos" />
              <button id="modalNext" aria-label="Next" data-cursor="Next">
                →
              </button>
              <button id="modalShare" className="modal__share" data-cursor="Copy">
                Copy link
              </button>
              <button data-close className="modal__close" aria-label="Close" data-cursor="Close">
                ✕
              </button>
            </div>
          </header>
          <div className="modal__body" id="modalBody" />
        </article>
      </div>
      <div className="toast mono" id="toast" role="status" />

      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id="owGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2BFFB0" />
            <stop offset="1" stopColor="#7CF3FF" />
          </linearGradient>
          <symbol id="ow-mark" viewBox="0 0 64 64">
            <path d="M4 32 C 16 12, 48 12, 60 32 C 48 52, 16 52, 4 32 Z" fill="none" stroke="url(#owGrad)" strokeWidth="3.2" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="10.5" fill="none" stroke="url(#owGrad)" strokeWidth="3.2" />
            <circle cx="32" cy="32" r="3.6" fill="#2BFFB0" />
            <path d="M32 6 V14 M32 50 V58" stroke="url(#owGrad)" strokeWidth="3.2" strokeLinecap="round" />
          </symbol>
        </defs>
      </svg>

      <script id="ow-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, "\\u003c") }} />
      <Experience />
    </>
  );
}
