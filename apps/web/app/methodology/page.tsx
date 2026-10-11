import { FLAG, RED_MASK } from "@overwatch/core";
import { ORACLE_PROGRAMS } from "@overwatch/core";
import { Section } from "@/components/ui/Section";

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
  ["TIMELOCK_REMOVED", "CRITICAL"], ["TIMELOCK_REDUCED", "HIGH"], ["THRESHOLD_LOWERED", "HIGH · CRITICAL if new threshold ≤ 2"],
  ["UPGRADE_AUTHORITY_CHANGED", "CRITICAL"], ["AUTHORITY_BECAME_SINGLE_KEY", "CRITICAL"],
  ["SIGNER_NONCE_ACCOUNT_CREATED", "HIGH · CRITICAL if ≥ threshold signers are exposed"], ["SIGNER_DURABLE_NONCE_TX", "HIGH"],
  ["CONFIG_AUTHORITY_SET", "HIGH"], ["MEMBERS_CHANGED", "MEDIUM · HIGH with a threshold change within 7 days"],
  ["PROPOSAL_WEAKENS_CONTROLS", "HIGH"], ["PROGRAM_UPGRADED", "MEDIUM"], ["COLLATERAL_RISKY_EXTENSION", "HIGH"], ["ORACLE_DEPRECATED", "HIGH"],
  ["ADMIN_PARAM_CHANGED", "MEDIUM/HIGH per adapter"], ["any strengthening change", "INFO (green)"],
];

export default function Methodology() {
  return (
    <article className="px-4 sm:px-10 pt-28 max-w-4xl space-y-14">
      <header>
        <p className="label">methodology · v1</p>
        <h1 className="text-4xl sm:text-6xl font-light mt-4">Facts first, <span className="serif text-accent">opinions second</span>.</h1>
        <p className="text-chrome mt-5 leading-relaxed">Every score is a deterministic function of facts shown on the protocol page. Each fact links to the raw account. The code is <span className="mono text-ink">packages/core/src/scoring.ts</span> and <span className="mono text-ink">rules.ts</span>, and the unit tests cover every rule, including a replay of the Drift timeline.</p>
      </header>

      <Section k="01" title="Score (0–100)">
        <p className="text-chrome mb-4">Start at 100, subtract, clamp to 0–100. Threshold and timelock deductions use the weakest relevant multisig, not the sum.</p>
        <table className="w-full text-sm border hairline">{RULES.map(([r, p]) => <tbody key={r}><tr className="border-b hairline"><td className="px-4 py-2.5">{r}</td><td className="px-4 py-2.5 mono text-bad text-right whitespace-nowrap">{p}</td></tr></tbody>)}</table>
        <p className="mono text-sm mt-4">Grades: <span className="text-ok">A ≥ 85</span> · <span className="text-ok">B ≥ 70</span> · <span className="text-warn">C ≥ 55</span> · <span className="text-bad">D ≥ 40</span> · <span className="text-bad">F &lt; 40</span>. Colour is always paired with the letter and a word.</p>
      </Section>

      <Section k="02" title="Events and severity">
        <table className="w-full text-sm border hairline">{EVENTS.map(([e, s]) => <tbody key={e}><tr className="border-b hairline"><td className="px-4 py-2.5 mono text-xs">{e}</td><td className="px-4 py-2.5 text-chrome">{s}</td></tr></tbody>)}</table>
        <p className="text-chrome mt-4"><span className="text-bad">Drift pattern:</span> any weakening event within 14 days of a signer creating a durable nonce account (or the reverse) escalates to CRITICAL.</p>
      </Section>

      <Section k="03" title="Flags bitmap (u64, published onchain)">
        <table className="w-full text-sm border hairline">
          <tbody>{Object.entries(FLAG).map(([k, v]) => <tr key={k} className="border-b hairline"><td className="px-4 py-2 mono text-dim w-16">bit {v.toString(2).length - 1}</td><td className="px-4 py-2 mono">{k}</td><td className="px-4 py-2 text-right">{(RED_MASK & v) !== 0n ? <span className="text-bad mono text-xs">RED_MASK</span> : ""}</td></tr>)}</tbody>
        </table>
        <p className="text-chrome mt-4">RED_MASK = <span className="mono text-ink">0x{RED_MASK.toString(16)}</span>: a single key, a signer with a durable nonce, no timelock <em>combined with</em> threshold ≤ 2 (derived bit 10), or a recent CRITICAL weakening (derived bit 11). The derived bits let onchain programs use a plain <span className="mono">flags &amp; RED_MASK != 0</span>.</p>
      </Section>

      <Section k="04" title="Data sources">
        <ul className="space-y-2 text-sm text-chrome list-disc pl-5">
          <li>Program and ProgramData accounts (BPF upgradeable loader): the 36-byte program account and the 45-byte ProgramData header, fetched with <span className="mono">dataSlice</span>. Layouts are verified against real mainnet fixtures.</li>
          <li>Squads v4 multisigs, decoded with <span className="mono">@sqds/multisig</span>. Each multisig is mapped from the authority&apos;s transaction history and then <strong>verified</strong> by deriving vault PDAs 0–7 until one equals the onchain upgrade authority.</li>
          <li>Durable nonce accounts: System Program accounts of 80 bytes whose authority (offset 8) is a watched signer. Found by a <span className="mono">getProgramAccounts</span> scan, real-time <span className="mono">programSubscribe</span> where the RPC allows it, and the signer log stream.</li>
          <li>Token-2022 extensions, parsed from the mint TLV (PermanentDelegate, TransferHook, DefaultAccountState, Pausable).</li>
          <li>Oracle owner programs: {ORACLE_PROGRAMS.map((o) => `${o.name}${o.deprecated ? " (deprecated)" : ""}`).join(", ")}.</li>
          <li>TVL from DefiLlama, for display only.</li>
        </ul>
      </Section>

      <Section k="05" title="Limitations">
        <ul className="space-y-2 text-sm text-chrome list-disc pl-5">
          <li>Several programs are controlled by addresses we have not yet attributed. They are labeled &quot;unmapped&quot; and lose 15 points, because unknown is not the same as safe.</li>
          <li>Realms DAO and Squads v3 governance parameters are not decoded yet (Squads v3 has limited support).</li>
          <li>Admin-config adapters (withdraw limits, listing authority) are not yet mapped for most protocols. See TODO.md.</li>
          <li>The Drift case study is reconstructed from public incident reports, not from onchain data.</li>
          <li>The onchain registry trusts its publisher keys (up to 5, chosen by a Squads multisig admin). Overwatch watches its own registry too.</li>
        </ul>
      </Section>
    </article>
  );
}
