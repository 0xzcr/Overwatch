import { driftReplay, driftSources, warningDays } from "@/site/data";
import { PageHero, stage } from "@/site/ui";

export const metadata = { title: "Case study: Drift" };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function DriftCase() {
  const steps = driftReplay();
  const days = warningDays(steps);
  const first = steps[0];

  return (
    <>
      <PageHero
        dock="Drift"
        eyebrow={<span className="label--bad">Case study · reconstructed from public incident reports</span>}
        lines={[
          <>
            Drift lost <span className="serif bad">$285M.</span>
          </>,
          <>
            Warned <span className="serif hero__accent">{days} days</span> early.
          </>,
        ]}
        lede="No smart-contract bug was involved. The attacker collected pre-signed durable-nonce transactions from Security Council signers, waited, and used them to take admin. Step through the timeline: every alert is produced by Overwatch's real rules engine, run on snapshots reconstructed from the reports."
        stageAttrs={stage("knot", { colorA: "#FFB547", colorB: "#1b2340", x: 3, y: 0.6, yNarrow: 1.5, scale: 0.85, autoRotate: 0.16, jitter: 0.02, opacity: 0.95 })}
      />

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
          <p className="label mono">[ Sources and labelling ]</p>
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
