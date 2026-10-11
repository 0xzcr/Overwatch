import Link from "next/link";
import { pages } from "./content";
import { cssVars } from "./ui";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

/** Persistent chrome: boot sequence, WebGL canvas, cursor, nav, menu and dock. Rendered once in the root layout. */
export function Chrome() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <div className="boot" id="boot" aria-hidden="true">
        <div className="boot__grid" />
        <div className="boot__inner">
          <Logo className="logo logo--boot" />
          <ol className="boot__log" id="bootLog" />
        </div>
        <div className="boot__foot">
          <span className="mono">OVERWATCH</span>
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

      <header className="nav" id="nav">
        <Link href="/" className="nav__brand" data-cursor="Home" aria-label="Overwatch home">
          <Logo />
        </Link>
        <NavLinks />
        <div className="nav__actions">
          <button className="nav__link" id="menuOpen" data-cursor="Menu" aria-expanded="false" aria-controls="menu">
            <span>Menu</span>
            <span className="nav__burger">
              <i />
              <i />
            </span>
          </button>
          <Link className="btn btn--glow btn--sm" href="/alerts" data-cursor="Alerts">
            <span>Get alerts</span>
          </Link>
        </div>
      </header>

      <div className="menu" id="menu" aria-hidden="true" role="dialog" aria-label="Site menu">
        <div className="menu__bg" />
        <div className="menu__inner">
          <div className="menu__head mono">
            <span />
            <button className="menu__close" id="menuClose" data-cursor="Close" aria-label="Close menu">
              Close <span>✕</span>
            </button>
          </div>
          <ol className="menu__list">
            {pages.map((p, i) => (
              <li key={p.href} style={cssVars({ "--c": p.color })}>
                <Link href={p.href} data-shape={p.shape} data-color={p.color} data-cursor="Go">
                  <span className="mono menu__num">{String(i).padStart(2, "0")}</span>
                  <span className="menu__name">{p.name}</span>
                  <span className="menu__kicker mono">{p.kicker}</span>
                  <span className="menu__count mono">→</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="menu__foot mono">
            <span>Hover a page to preview it on the stage</span>
            <span>Mainnet: read-only · Devnet: demo</span>
          </div>
        </div>
      </div>

      <div className="dock" id="dock" aria-label="Section navigation">
        <button className="dock__btn" id="dockPrev" aria-label="Previous section" data-cursor="Prev">
          ←
        </button>
        <div className="dock__now">
          <svg className="dock__ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" />
            <circle id="dockProg" cx="18" cy="18" r="15.5" />
          </svg>
          <span className="mono dock__num" id="dockNum">
            00
          </span>
          <span className="dock__name" id="dockName" />
        </div>
        <button className="dock__btn" id="dockNext" aria-label="Next section" data-cursor="Next">
          →
        </button>
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
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__top">
        <div className="footer__brand">
          <Logo className="logo logo--footer" />
          <p>A smoke detector for Solana DeFi. We map who can move your money, and we tell you the moment those controls get weaker.</p>
        </div>
        <div className="footer__cols">
          <div>
            <h4 className="mono">Watch</h4>
            <Link href="/protocols">Control map</Link>
            <Link href="/events">Live events</Link>
            <Link href="/case-study">Case study</Link>
          </div>
          <div>
            <h4 className="mono">Act</h4>
            <Link href="/alerts">Alerts</Link>
            <Link href="/vault">Protected vault</Link>
            <Link href="/demo">Demo console</Link>
          </div>
          <div>
            <h4 className="mono">Learn</h4>
            <Link href="/methodology">Methodology</Link>
            <Link href="/docs/api">API reference</Link>
          </div>
        </div>
      </div>
      <div className="footer__word" aria-hidden="true">
        OVERWATCH
      </div>
      <div className="footer__base mono">
        <span>© 2026 Overwatch</span>
        <span>Mainnet reads are read-only. The registry, vault and demo run on devnet.</span>
        <a href="#top" data-cursor="Top">
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
