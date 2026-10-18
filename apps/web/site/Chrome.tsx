import Link from "next/link";
import { pages } from "./content";
import { cssVars } from "./ui";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import { NavClock } from "./NavClock";

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
          <span className="nav__word" aria-hidden="true">
            Overwatch
          </span>
        </Link>
        <NavLinks />
        <div className="nav__actions">
          <NavClock />
          <button className="nav__link nav__menu" id="menuOpen" data-cursor="Menu" aria-expanded="false" aria-controls="menu">
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
            {pages.map((p) => (
              <li key={p.href} style={cssVars({ "--c": p.color })}>
                <Link href={p.href} data-shape={p.shape} data-color={p.color} data-cursor="Go">
                  <span className="menu__name">{p.name}</span>
                  <span className="menu__kicker">{p.kicker}</span>
                  <span className="menu__count mono">→</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="menu__foot">
            <span>Mainnet data is read-only. The registry, vault and demo run on devnet.</span>
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
          <symbol id="ow-mark" viewBox="0 0 48 48">
            <g stroke="url(#owGrad)" strokeLinejoin="round">
              <path d="M15.6 15 L12 1.5 L20.6 12 Z M32.4 15 L36 1.5 L27.4 12 Z" fill="#0b1d18" strokeWidth="2" />
              <path d="M16 11.5 L32 11.5 L37.5 19.5 L31.5 30 L28.5 40 L19.5 40 L16.5 30 L10.5 19.5 Z" fill="#07120f" strokeWidth="2.4" />
            </g>
            <path d="M16.4 21.8 L21.4 22.9 L17.4 24.2 Z M31.6 21.8 L26.6 22.9 L30.6 24.2 Z" fill="#2BFFB0" />
            <path d="M21.4 30.2 L26.6 30.2 L24 33.1 Z" fill="#7CF3FF" />
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
          <p>Overwatch reads who can change the Solana protocols holding your deposits and alerts you after those controls weaken onchain. It watches authority, not prices or code.</p>
        </div>
        <div className="footer__cols">
          <div>
            <h4>Watch</h4>
            <Link href="/protocols">Control map</Link>
            <Link href="/events">Live events</Link>
            <Link href="/case-study">Case study</Link>
          </div>
          <div>
            <h4>Act</h4>
            <Link href="/alerts">Alerts</Link>
            <Link href="/vault">Protected vault</Link>
            <Link href="/demo">Demo console</Link>
          </div>
          <div>
            <h4>Learn</h4>
            <Link href="/docs">Documentation</Link>
            <Link href="/docs/api">API reference</Link>
          </div>
        </div>
      </div>
      <div className="footer__base">
        <span>© 2026 Overwatch</span>
        <span>Mainnet reads are read-only. The registry, vault and demo run on devnet.</span>
        <a href="#top" data-cursor="Top">
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
