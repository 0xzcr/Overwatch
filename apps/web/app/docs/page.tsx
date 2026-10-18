import Link from "next/link";
import { FLAG, RED_MASK, ORACLE_PROGRAMS } from "@overwatch/core";
import { PageHero, Term, stage } from "@/site/ui";

export const metadata = { title: "Documentation" };

// The scoring, event and flag tables below are the published methodology: the source of truth that
// packages/core/src/scoring.ts and rules.ts must match.

const TOC: [id: string, label: string][] = [
  ["what", "What Overwatch is"],
  ["how", "How it works"],
  ["scoring", "Scoring and grades"],
  ["events", "Events and severity"],
  ["flags", "Flags and red"],
  ["sources", "Data sources"],
  ["depositors", "Use it as a depositor"],
  ["builders", "Use it as a builder"],
  ["onchain", "Use it onchain"],
  ["protocols", "If you run a protocol"],
  ["verify", "Verify everything yourself"],
  ["limits", "Limitations"],
  ["fit", "Where it fits"],
  ["status", "Status of this deployment"],
];

const PIPELINE: [step: string, text: string][] = [
  [
    "Read",
    "For every protocol on the watch list, read the accounts that decide who can change it: the ProgramData header (upgrade authority at bytes 13–44), the Squads v4 multisig behind it, its signers, and any durable nonce accounts those signers control.",
  ],
  [
    "Diff",
    "Compare each new snapshot with the previous one. Every difference becomes a typed event, such as TIMELOCK_REMOVED or SIGNER_NONCE_ACCOUNT_CREATED, with a plain-English explanation.",
  ],
  [
    "Score",
    "Start at 100, subtract the deductions below, clamp to 0–100 and map to a grade. The rules are code in the repo: packages/core/src/scoring.ts and rules.ts, with unit tests for every rule.",
  ],
  [
    "Publish",
    "Write the score, grade and a flags bitmap to a RiskRecord account in the onchain registry, so any Solana program can read it.",
  ],
  ["Alert", "Send the event to Telegram, signed webhooks or email, and stream it over Server-Sent Events."],
];

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

const GRADES: [g: string, range: string, word: string][] = [
  ["A", "≥ 85", "Strong"],
  ["B", "≥ 70", "Good"],
  ["C", "≥ 55", "Caution"],
  ["D", "≥ 40", "Weak"],
  ["F", "< 40", "Dangerous"],
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

const sevClass = (s: string) =>
  s.startsWith("CRITICAL") ? "bad" : s.startsWith("HIGH") ? "warn" : s.startsWith("INFO") ? "ok" : "";

export default function Docs() {
  return (
    <>
      <PageHero
        dock="Docs"
        lines={["Documentation"]}
        lede="What Overwatch watches, exactly how a grade is computed, and how depositors, builders and protocols use it. Every claim here is checkable against the code and the chain."
        stageAttrs={stage("graph", {
          colorA: "#5AA8FF",
          colorB: "#2BFFB0",
          x: 2.6,
          y: 0.4,
          yNarrow: 1.5,
          scale: 0.85,
          opacity: 1,
        })}
      />

      <section className="page-block docs" data-dock="Docs">
        <nav className="docs__toc" aria-label="On this page">
          <p className="mono label">On this page</p>
          <ol>
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="docs__body">
          <h2 id="what">What Overwatch is</h2>
          <p>
            Overwatch is an early-warning system for people with deposits in Solana DeFi. It watches the{" "}
            <em>control plane</em> of a protocol: who is allowed to change the code and the settings that decide what
            happens to your funds.
          </p>
          <p>
            On Solana, &quot;who controls this protocol&quot; is stored as bytes at known offsets in public accounts.
            Anyone can read it. Before the April 2026 Drift loss (about $285M in twelve minutes), the warning signs sat
            onchain for days. Nobody was reading them on the depositor&apos;s behalf. Overwatch does.
          </p>
          <p>
            It watches <b>authority</b>: <Term t="upgrade authority" />, <Term t="multisig" /> <Term t="threshold" />,{" "}
            <Term t="timelock" />, the signer set, <Term t="durable nonce" /> accounts, Token-2022 extensions and{" "}
            <Term t="oracle" /> dependencies. It does <b>not</b> watch prices, TVL, solvency, bad debt, depegs or
            exploits in progress.
          </p>

          <h2 id="how">How it works</h2>
          <ol className="docs__steps">
            {PIPELINE.map(([step, text], i) => (
              <li key={step}>
                <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{step}</b>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p>
            Watched accounts are subscribed over websocket, so most changes appear seconds after they confirm.
            Signers&apos; durable nonce accounts are found by an hourly scan, and a full reconcile runs every five
            minutes.
          </p>

          <h2 id="scoring">Scoring and grades</h2>
          <p>
            Every grade is a deterministic function of facts shown on the protocol page, and each fact links to its raw
            account. Start at 100, subtract, clamp to 0–100. Threshold and timelock deductions use the weakest relevant
            multisig, not the sum.
          </p>
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
          <table className="dtable">
            <tbody>
              {GRADES.map(([g, range, word]) => (
                <tr key={g}>
                  <td className="mono">{g}</td>
                  <td className="mono">{range}</td>
                  <td>{word}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Colour is always paired with the letter and a word, so a grade never relies on colour alone. TVL comes from
            DefiLlama for display only and never affects a grade.
          </p>

          <h2 id="events">Events and severity</h2>
          <p>
            The rules engine diffs each new snapshot against the previous one and emits typed events with a
            plain-English explanation.
          </p>
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
            <b className="bad">The Drift pattern.</b> Any weakening event within 14 days of a signer creating a durable
            nonce account, or the reverse, escalates to CRITICAL regardless of the individual deductions. Pre-signed
            nonce transactions never expire, which is how the Drift attacker held admin power in reserve.
          </p>

          <h2 id="flags">Flags and red</h2>
          <p>
            Each score is published with a u64 flags bitmap. A protocol is <b className="bad">red</b> when{" "}
            <span className="mono">flags &amp; RED_MASK != 0</span>, where RED_MASK ={" "}
            <span className="mono">0x{RED_MASK.toString(16)}</span>: a single key, a signer with a durable nonce, no
            timelock combined with a threshold of two or fewer, or a recent CRITICAL weakening. Red is the signal a
            vault acts on.
          </p>
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

          <h2 id="sources">Data sources</h2>
          <ul className="bullets">
            <li>
              Program and ProgramData accounts (BPF upgradeable loader): the 36-byte program account and the 45-byte
              ProgramData header, fetched with <span className="mono">dataSlice</span>. Layouts are verified against
              real mainnet fixtures.
            </li>
            <li>
              Squads v4 multisigs, decoded with <span className="mono">@sqds/multisig</span>. Each multisig is mapped
              from the authority&apos;s transaction history, then verified by deriving vault PDAs 0–7 until one equals
              the onchain upgrade authority.
            </li>
            <li>
              Durable nonce accounts: 80-byte System Program accounts whose authority (offset 8) is a watched signer,
              found by a <span className="mono">getProgramAccounts</span> scan, realtime subscriptions where the RPC
              allows it, and the signer log stream.
            </li>
            <li>
              Token-2022 extensions, parsed from the mint TLV (PermanentDelegate, TransferHook, DefaultAccountState,
              Pausable).
            </li>
            <li>
              Oracle owner programs:{" "}
              {ORACLE_PROGRAMS.map((o) => `${o.name}${o.deprecated ? " (deprecated)" : ""}`).join(", ")}.
            </li>
          </ul>

          <h2 id="depositors">Use it as a depositor</h2>
          <ol className="bullets">
            <li>
              Open the <Link href="/protocols">control map</Link> and find the protocols holding your deposits. Sort by
              grade, or filter by category.
            </li>
            <li>
              Open a protocol to see who can move your money: the upgrade authority, the multisig, its signers, the
              timelock, every deduction and its change history.
            </li>
            <li>
              Set up <Link href="/alerts">alerts</Link>. On Telegram, send <span className="mono">/watch drift</span>,{" "}
              <span className="mono">/list</span> or <span className="mono">/status kamino-lend</span> to the bot. Email
              and webhooks are on the same page. Pick a minimum severity so you only hear about what matters.
            </li>
            <li>
              When an alert arrives it says what changed, why it matters and what you can do, with a link to the
              transaction. Deciding whether to withdraw is yours.
            </li>
          </ol>

          <h2 id="builders">Use it as a builder</h2>
          <p>
            The <Link href="/docs/api">API</Link> is JSON over HTTPS. Every response is{" "}
            <span className="mono">{"{ version, data }"}</span>, and anonymous use is limited to 30 requests a minute.
          </p>
          <ul className="bullets">
            <li>
              <span className="mono">GET /api/v1/protocols</span> and <span className="mono">/protocols/:slug</span> for
              grades, flags and the full control snapshot.
            </li>
            <li>
              <span className="mono">GET /api/v1/events?severity=high</span> for the event log, and{" "}
              <span className="mono">/api/v1/stream</span> for live Server-Sent Events.
            </li>
            <li>
              <span className="mono">POST /api/v1/subscriptions/webhook</span> to register a webhook. Each delivery
              carries <span className="mono">x-overwatch-signature = hex(HMAC-SHA256(secret, rawBody))</span>; verify it
              with <span className="mono">verifyWebhook</span> from <span className="mono">@overwatch/sdk</span>. Failed
              deliveries retry with backoff, up to 6 attempts.
            </li>
          </ul>

          <h2 id="onchain">Use it onchain</h2>
          <p>
            Each protocol&apos;s score lives in a <span className="mono">RiskRecord</span> PDA at{" "}
            <span className="mono">[&quot;risk&quot;, sha256(slug)]</span> under the registry program. A program checks
            the owner and the PDA, then tests <span className="mono">flags &amp; RED_MASK != 0</span>.
          </p>
          <p>
            The vault program in this repository (<span className="mono">programs/overwatch_vault</span>) shows the
            pattern. It allocates deposits to a strategy and exposes <span className="mono">check_and_exit</span>, which
            anyone can call. If the registry says the protocol is red, the vault pulls the funds back. The vault only
            ever reads the registry; it never trusts a signature from Overwatch, and{" "}
            <span className="mono">check_and_exit</span> has no admin gate by design.
          </p>
          <p>
            The registry rejects any update whose event slot is older than the one it holds, so history cannot be
            rewritten backwards. Publishers are a whitelist of up to five keys chosen by a Squads multisig admin.
          </p>

          <h2 id="protocols">If you run a protocol</h2>
          <p>
            Every deduction is public and has a fix: add or lengthen a timelock, raise the multisig threshold, retire a
            single-key authority, and keep signers away from durable nonce accounts. The grade updates on the next
            snapshot after the change confirms.
          </p>
          <p>
            A protocol can never pay for a score. Sponsorship can only buy a listing and registered change windows, and
            sponsors are published.
          </p>

          <h2 id="verify">Verify everything yourself</h2>
          <p>
            Every alert and every score carries the raw account address and the slot it was read at. You can fetch the
            same account at the same slot and recompute the result with the rules in{" "}
            <span className="mono">packages/core</span>. There is no appeal to authority: if Overwatch is wrong, the
            chain shows it.
          </p>

          <h2 id="limits">Limitations</h2>
          <ul className="bullets">
            <li>
              Overwatch reads authority, not code. It does not audit programs or track solvency, prices, bad debt or
              exploits in progress.
            </li>
            <li>
              It warns after a change lands onchain and cannot undo an executed action. Detection lag is the poll
              interval plus confirmation; nonce accounts are scanned hourly.
            </li>
            <li>
              Protocols off the watch list are invisible to it. Key hygiene and social engineering happen off-chain,
              where it cannot see.
            </li>
            <li>
              Some programs are controlled by addresses we have not attributed yet. They are labelled
              &quot;unmapped&quot; and lose 15 points, because unknown is not safe.
            </li>
            <li>Realms DAO and Squads v3 governance parameters are not decoded yet (Squads v3 has limited support).</li>
            <li>
              Admin-config adapters (withdraw limits, listing authority) are mapped for only a few protocols so far.
            </li>
            <li>
              The <Link href="/case-study">Drift case study</Link> is a backtest: current rules applied to a timeline
              reconstructed from public incident reports. It is not a live catch.
            </li>
            <li>
              The onchain registry trusts its publisher keys (up to 5, chosen by a Squads multisig admin). Overwatch
              watches its own registry too.
            </li>
          </ul>

          <h2 id="fit">Where it fits</h2>
          <p>
            The Solana Foundation&apos;s STRIDE program funds threat monitoring for protocols over $10M in TVL, and the
            protocol is the customer. SIRN responds after funds move. Overwatch is the complement: it covers the long
            tail below the TVL gate, it answers to depositors rather than the protocol, and it warns before funds move
            rather than responding after.
          </p>

          <h2 id="status">Status of this deployment</h2>
          <p>
            This site reads a live database of mainnet authority, scores and change history. If the database is
            unreachable, pages show the mainnet snapshot from October 11, 2026 and say so. The onchain registry and
            vault programs run on devnet.
          </p>
        </div>
      </section>
    </>
  );
}
