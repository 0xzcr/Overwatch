import { manifesto } from "@/site/content";
import { driftReplay, driftSources, loadProtocols, warningDays } from "@/site/data";
import { PageHero, Term, cssVars, stage } from "@/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case study" };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function CaseStudy() {
  const { headline: h } = await loadProtocols();
  const steps = driftReplay();
  const days = warningDays(steps);
  const first = steps[0];

  return (
    <>
      <PageHero
        dock="Case study"
        lines={[
          <>
            Drift lost <span className="serif bad">$285M.</span>
          </>,
          <>
            Warned <span className="serif hero__accent">{days} days</span> early.
          </>,
        ]}
        lede="No smart-contract bug was involved. The attacker collected pre-signed durable-nonce transactions from Security Council signers, waited, and used them to take admin. Reconstructed from public incident reports."
        stageAttrs={stage("knot", { colorA: "#FFB547", colorB: "#1b2340", x: 3, y: 0.6, yNarrow: 1.5, scale: 0.85, autoRotate: 0.16, jitter: 0.02, opacity: 0.95 })}
      />

      <section className="manifesto" id="why" data-dock="Why" {...stage("scatter", { colorA: "#7CF3FF", colorB: "#2a2f5a", opacity: 0.55, autoRotate: 0.03 })}>
        <div className="manifesto__pin">
          <p className="manifesto__text">
            {manifesto.split(" ").map((w, i) => (
              <span className={`w${/\$285M|nine|Nobody|locks\./.test(w) ? " w--hot" : ""}`} key={i}>
                {w}{" "}
              </span>
            ))}
          </p>
          <p className="manifesto__sig">Existing monitors serve protocol teams. Overwatch watches on behalf of depositors.</p>
        </div>
      </section>

      <section
        className="stats"
        id="numbers"
        data-dock="The locks"
        {...stage("lattice", { colorA: "#7CF3FF", colorB: "#8B7CFF", opacity: 0.75, x: 3.2, y: 0.9, scale: 0.85, autoRotate: 0.14, tiltX: 0.2 })}
      >
        <header className="section-head">
          <h2 className="h2">
            {h.total} protocols. <span className="serif">{h.tvl}</span> in deposits.
            <br />
            Here is who holds the keys.
          </h2>
        </header>
        <div className="stats__grid">
          <div className="stat" style={cssVars({ "--c": "#FF5A3D" })}>
            <b className="stat__num mono" data-count={h.lowNoDelay}>
              {h.lowNoDelay}
            </b>
            <span className="stat__label">changeable by ≤2 people with no delay</span>
            <span className="stat__sub mono">of the top {h.total} Solana protocols</span>
          </div>
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
          <div className="stat" style={cssVars({ "--c": "#8B7CFF" })}>
            <b className="stat__num mono" data-count={h.unmapped}>
              {h.unmapped}
            </b>
            <span className="stat__label">with control we can&apos;t fully map yet</span>
            <span className="stat__sub mono">unknown is not the same as safe</span>
          </div>
        </div>
      </section>

      <section className="drift page-block" id="replay" data-dock="Replay" data-dock-color="#FF5A3D" data-stage="drift">
        <div className="drift__board">
          <div className="drift__clock">
            <p className="mono label">days of warning</p>
            <p className="drift__days mono" id="driftDays">
              0.0
            </p>
            <p className="mono hud__dim" id="driftLeft">
              until the drain
            </p>
            <div className="drift__grade">
              <span className="mono label">grade</span>
              <b id="driftGrade">{first?.grade}</b>
              <span className="mono" id="driftScore">
                {first?.score}/100
              </span>
              <span className="mono drift__red" id="driftRed" hidden>
                RED
              </span>
            </div>
          </div>

          <ol className="drift__steps">
            {steps.map((st, i) => (
              <li key={st.date} className={`drift__step lvl-${st.level}${i === 0 ? " is-on" : ""}`}>
                <button data-step={i} data-cursor="Step">
                  <span className="mono">{fmtDate(st.date)}</span>
                  <b>{st.headline}</b>
                </button>
              </li>
            ))}
          </ol>

          <div className="drift__detail" aria-live="polite" id="driftDetail">
            <p className="mono drift__date">{first ? new Date(first.date).toUTCString() : ""}</p>
            <h3>{first?.headline}</h3>
            <p>{first?.detail}</p>
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
        <p className="page-note mono">Use ← and → to step through the timeline.</p>
      </section>

      <section className="page-block" data-dock="Sources">
        <div className="sources">
          <h2 className="h2">Sources</h2>
          <ul>
            {driftSources.map((x) => (
              <li key={x.url}>
                <a href={x.url} target="_blank" rel="noreferrer">
                  {x.label} ↗
                </a>
              </li>
            ))}
          </ul>
          <p>
            Reconstructed data: the reports do not publish full signer or nonce addresses, so these use placeholders (signer-A…F). The pre-migration threshold and timelock were
            not published; the reports describe the council as 2-of-5 with no timelock at the time of the attack, so both councils are modelled that way. Dates follow
            BlockSec&apos;s timeline. Drift&apos;s current council (4-of-7, 1-hour timelock) is watched live on its protocol page.
          </p>
        </div>
      </section>
      <script id="ow-drift" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(steps).replace(/</g, "\\u003c") }} />
    </>
  );
}
