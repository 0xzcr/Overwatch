import { FLAG, RED_MASK, ORACLE_PROGRAMS } from "@overwatch/core";
import { visual } from "@/site/visuals";
import { PageHero, SectionHead, Term, Vis, stage } from "@/site/ui";

export const metadata = { title: "Methodology" };

const RULES: [string, string][] = [
  ["Upgrade authority is a single key", "−60"],
  ["Controlled multisig (Squads configAuthority set)", "−20"],
  ["Threshold ≤ 2", "−20"],
  ["Otherwise, threshold / voting members < 50%", "−10"],
  ["Timelock = 0", "−25"],
  ["Timelock < 24h", "−15"],
  ["Timelock < 48h", "−5"],
  ["Each signer holding an active durable nonce account", "−10 (max −30)"],
  ["A pending proposal would weaken controls", "−10"],
  ["Any HIGH/CRITICAL weakening event in the last 30 days", "−10"],
  ["Collateral with PermanentDelegate, or a deprecated oracle", "−10 each (max −20)"],
  ["Control we could not map (unmapped PDA, unknown, Realms/Squads v3 not yet decoded)", "−15"],
  ["Immutable program", "no upgrade deductions"],
];

const EVENTS: [string, string][] = [
  ["TIMELOCK_REMOVED", "CRITICAL"],
  ["TIMELOCK_REDUCED", "HIGH"],
  ["THRESHOLD_LOWERED", "HIGH · CRITICAL if new threshold ≤ 2"],
  ["UPGRADE_AUTHORITY_CHANGED", "CRITICAL"],
  ["AUTHORITY_BECAME_SINGLE_KEY", "CRITICAL"],
  ["SIGNER_NONCE_ACCOUNT_CREATED", "HIGH · CRITICAL if ≥ threshold signers are exposed"],
  ["SIGNER_DURABLE_NONCE_TX", "HIGH"],
  ["CONFIG_AUTHORITY_SET", "HIGH"],
  ["MEMBERS_CHANGED", "MEDIUM · HIGH with a threshold change within 7 days"],
  ["PROPOSAL_WEAKENS_CONTROLS", "HIGH"],
  ["PROGRAM_UPGRADED", "MEDIUM"],
  ["COLLATERAL_RISKY_EXTENSION", "HIGH"],
  ["ORACLE_DEPRECATED", "HIGH"],
  ["ADMIN_PARAM_CHANGED", "MEDIUM/HIGH per adapter"],
  ["Any strengthening change", "INFO (green)"],
];

const GRADES: [string, string, string][] = [
  ["A", "≥ 85", "Strong"],
  ["B", "≥ 70", "Good"],
  ["C", "≥ 55", "Caution"],
  ["D", "≥ 40", "Weak"],
  ["F", "< 40", "Dangerous"],
];

const sevClass = (s: string) => (s.startsWith("CRITICAL") ? "bad" : s.startsWith("HIGH") ? "warn" : s.startsWith("INFO") ? "ok" : "");

export default function Methodology() {
  return (
    <>
      <PageHero
        dock="Methodology"
        lines={["Facts first,", <span key="s" className="serif hero__accent">opinions second.</span>]}
        lede={
          <>
            Every grade is a deterministic function of facts shown on the protocol page, and each fact links to its raw account. The code is{" "}
            <span className="mono">packages/core/src/scoring.ts</span> and <span className="mono">rules.ts</span>; unit tests cover every rule, including a replay of the Drift
            timeline.
          </>
        }
        stageAttrs={stage("shield", { colorA: "#8B7CFF", colorB: "#ff4fd8", x: 2.6, y: 0.2, yNarrow: 1.5, scale: 0.85, opacity: 1, front: true, sway: 0.45 })}
      />

      <section className="page-block method" data-dock="Score" {...stage("shield", { colorA: "#8B7CFF", colorB: "#1b2340", opacity: 0.2, scale: 1.4, front: true, sway: 0.3 })}>
        <SectionHead title="Score, 0 to 100" lede="Start at 100, subtract, clamp to 0–100. Threshold and timelock deductions use the weakest relevant multisig, not the sum." row />
        <div className="method__split">
          <table className="dtable">
            <tbody>
              {RULES.map(([r, p]) => (
                <tr key={r}>
                  <td>{r}</td>
                  <td className="mono bad">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="method__side">
            <Vis className="method__vis" html={visual({ id: "m-ledger", code: "OW", chapter: "score", title: "Deductions", vis: "ledger", summary: "" }, "#8B7CFF")} />
            <ol className="grades" data-reveal>
              {GRADES.map(([g, s, w]) => (
                <li key={g} className={`grade grade--md g-${g}`}>
                  <b>{g}</b>
                  <span className="mono">
                    {s} · {w}
                  </span>
                </li>
              ))}
            </ol>
            <p className="page-note">Colour is always paired with the letter and a word, so a grade never relies on colour alone.</p>
          </div>
        </div>
      </section>

      <section className="page-block method" data-dock="Events">
        <SectionHead title="Events and severity" lede="The rules engine diffs each new snapshot against the previous one and emits typed events with a plain-English explanation." row />
        <table className="dtable">
          <tbody>
            {EVENTS.map(([e, s]) => (
              <tr key={e}>
                <td className="mono">{e}</td>
                <td className={sevClass(s)}>{s}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="callout">
          <b className="bad">Drift pattern.</b> Any weakening event within 14 days of a signer creating a <Term t="durable nonce">durable nonce</Term> account (or the reverse)
          escalates to CRITICAL.
        </p>
      </section>

      <section className="page-block method" data-dock="Flags">
        <SectionHead title="Flags bitmap (u64, published onchain)" row />
        <div className="method__split">
          <table className="dtable">
            <tbody>
              {Object.entries(FLAG).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono dim">bit {v.toString(2).length - 1}</td>
                  <td className="mono">{k}</td>
                  <td className="mono bad">{(RED_MASK & v) !== 0n ? "RED_MASK" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="method__side">
            <Vis className="method__vis" html={visual({ id: "m-bits", code: "OW", chapter: "score", title: "Flags", vis: "bits", summary: "" }, "#8B7CFF")} />
            <p className="page-note">
              RED_MASK = <span className="mono">0x{RED_MASK.toString(16)}</span>: a single key, a signer with a durable nonce, no timelock <em>combined with</em> threshold ≤ 2 (derived
              bit 10), or a recent CRITICAL weakening (derived bit 11). Onchain programs check <span className="mono">flags &amp; RED_MASK != 0</span>.
            </p>
          </div>
        </div>
      </section>

      <section className="page-block method" data-dock="Sources">
        <SectionHead title="Data sources" row />
        <ul className="bullets">
          <li>
            Program and ProgramData accounts (BPF upgradeable loader): the 36-byte program account and the 45-byte ProgramData header, fetched with{" "}
            <span className="mono">dataSlice</span>. Layouts are verified against real mainnet fixtures.
          </li>
          <li>
            Squads v4 <Term t="multisig">multisigs</Term>, decoded with <span className="mono">@sqds/multisig</span>. Each multisig is mapped from the authority&apos;s transaction
            history, then verified by deriving vault PDAs 0–7 until one equals the onchain <Term t="upgrade authority">upgrade authority</Term>.
          </li>
          <li>
            <Term t="durable nonce">Durable nonce</Term> accounts: 80-byte System Program accounts whose authority (offset 8) is a watched signer, found by a{" "}
            <span className="mono">getProgramAccounts</span> scan, realtime subscriptions where the RPC allows it, and the signer log stream.
          </li>
          <li>Token-2022 extensions, parsed from the mint TLV (PermanentDelegate, TransferHook, DefaultAccountState, Pausable).</li>
          <li>
            <Term t="oracle">Oracle</Term> owner programs: {ORACLE_PROGRAMS.map((o) => `${o.name}${o.deprecated ? " (deprecated)" : ""}`).join(", ")}.
          </li>
          <li>TVL from DefiLlama, for display only. It never affects a grade.</li>
        </ul>
      </section>

      <section className="page-block method" data-dock="Limitations">
        <SectionHead title="Limitations" row />
        <ul className="bullets">
          <li>Some programs are controlled by addresses we have not attributed yet. They are labelled &quot;unmapped&quot; and lose 15 points, because unknown is not safe.</li>
          <li>Realms DAO and Squads v3 governance parameters are not decoded yet (Squads v3 has limited support).</li>
          <li>Admin-config adapters (withdraw limits, listing authority) are mapped for only a few protocols so far.</li>
          <li>The Drift case study is reconstructed from public incident reports, not from onchain data.</li>
          <li>The onchain registry trusts its publisher keys (up to 5, chosen by a Squads multisig admin). Overwatch watches its own registry too.</li>
        </ul>
      </section>
    </>
  );
}
