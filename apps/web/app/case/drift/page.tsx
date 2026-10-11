import { DRIFT_STEPS, DRIFT_SOURCES, diffSnapshots, scoreSnapshot, flagNames, type OverwatchEvent } from "@overwatch/core";
import { DriftReplay, type ReplayStep } from "@/components/DriftReplay";
import { Section } from "@/components/ui/Section";

export const metadata = { title: "Case study: Drift" };

function replay(): ReplayStep[] {
  const history: OverwatchEvent[] = [];
  return DRIFT_STEPS.map((st, i) => {
    const alerts = i === 0 ? [] : diffSnapshots(DRIFT_STEPS[i - 1]!.snapshot, st.snapshot, { history, slot: i, blockTime: st.date, now: st.date, name: "Drift" });
    history.push(...alerts);
    const sc = scoreSnapshot(st.snapshot, history, st.date);
    const level: ReplayStep["level"] = i === DRIFT_STEPS.length - 1 ? "dead" : alerts.some((a) => a.severity === "CRITICAL") ? "bad" : alerts.length || sc.red ? "warn" : "ok";
    return { date: st.date, headline: st.headline, detail: st.detail, level, alerts: alerts.map((a) => ({ severity: a.severity, title: a.title, explanation: a.explanation, labels: a.labels })), score: sc.score, grade: sc.grade, red: sc.red, flags: flagNames(sc.flags) };
  });
}

export default function DriftCase() {
  const steps = replay();
  return (
    <div className="px-4 sm:px-10 pt-28 space-y-14">
      <header className="max-w-4xl">
        <p className="label text-bad">case study · reconstructed from public incident reports</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4 leading-[1.02]">Drift lost <span className="serif text-bad">$285M</span>. The warning signs were public <span className="serif text-accent">9 days</span> earlier.</h1>
        <p className="text-chrome mt-5 max-w-2xl leading-relaxed">No smart-contract bug was involved. The attacker collected pre-signed durable-nonce transactions from Security Council signers, waited, and used them to take admin. Step through the timeline below. Each alert is produced by Overwatch&apos;s real rules engine, the same code that watches mainnet today, run on snapshots reconstructed from the incident reports.</p>
      </header>
      <DriftReplay steps={steps} />
      <Section k="src" title="Sources and labeling">
        <ul className="space-y-1.5 text-sm">{DRIFT_SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-chrome hover:text-accent">{s.label} ↗</a></li>)}</ul>
        <p className="text-xs text-dim mt-4 max-w-3xl leading-relaxed">Reconstructed data: the reports do not publish full signer or nonce addresses, so these use placeholders (signer-A…F). The pre-migration threshold and timelock were not published. Reports describe the council as 2-of-5 with zero timelock at the time of the attack, so both councils are modelled that way. Dates follow BlockSec&apos;s timeline. Drift&apos;s <em>current</em> council (watched live on its protocol page) is 4-of-7 with a 1-hour timelock.</p>
      </Section>
    </div>
  );
}
