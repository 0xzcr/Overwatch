import Link from "next/link";
import { FLAG, RED_MASK, ORACLE_PROGRAMS } from "@overwatch/core";
import { PageHero, Term, JsonLd, breadcrumbs, pageMetadata, ORGANIZATION_ID } from "@/site/ui"; // SEO component
import { SITE_URL } from "@/site/content"; // SEO component

const DESCRIPTION = // SEO component
  "How Overwatch reads Solana protocol controls, grades every way a protocol could be drained by keys to steal and time to withdraw, decides what is red, and how depositors, builders and onchain programs can use it."; // SEO component
export const metadata = pageMetadata({ title: "Documentation", description: DESCRIPTION, path: "/docs" }); // SEO component

/**
 * Short, self-contained answers to the questions people (and AI assistants) ask most. Each answer must make sense
 * when quoted on its own. The same list renders the FAQ section and its FAQPage structured data, so they always match.
 */
const FAQ: [question: string, answer: string][] = [
  // SEO component
  [
    // SEO component
    "What does Overwatch watch?", // SEO component
    "Overwatch watches who can change a Solana DeFi protocol: the program upgrade authority, the Squads multisig behind it, its threshold, timelock and signers, durable nonce accounts those signers control, Token-2022 extensions and oracle dependencies. It does not watch prices, TVL, solvency or exploits in progress.", // SEO component
  ], // SEO component
  [
    // SEO component
    "How quickly does Overwatch notice a control change?", // SEO component
    "Overwatch reads every watched account about every 15 seconds and checks each signer's new transactions about every minute, so most control changes appear within a minute of confirming onchain. If the indexer is ever down, it replays the transactions it missed when it restarts.", // SEO component
  ], // SEO component
  [
    // SEO component
    "How is a protocol's grade calculated?", // SEO component
    "For every power that could drain the protocol (upgrading its code, changing its risk settings), Overwatch finds the cheapest way to use it: how many private keys an attacker must steal, and how long the change waits before it takes effect, minus the time depositors need to withdraw. A grid turns those two numbers into A to F, and the protocol takes the grade of its weakest power. TVL never affects a grade.", // SEO component
  ], // SEO component
  [
    // SEO component
    "What makes a protocol red?", // SEO component
    "A protocol is red when a power that can drain it grades F: one key with less than a day's delay, or two keys with no delay. Durable nonce accounts, pending proposals and recent events are shown as flags but never make a protocol red on their own. Red is the signal a vault can act on.", // SEO component
  ], // SEO component
  [
    // SEO component
    "Doesn't a team need to act fast in an emergency?", // SEO component
    "Yes, and the grade allows for it. A fast power that can only make things safer, such as pausing, lowering limits or tightening risk settings, is listed but not graded. So is a power the program caps below 5% of deposits, which grades no lower than D. Only powers that can take depositors' money need keys and a delay. A team that splits the two keeps its speed and its grade. Teams can also show us code we cannot read yet; until then the protocol shows as unverified, not as a letter.", // SEO component
  ], // SEO component
  [
    // SEO component
    "Can Overwatch stop an attack?", // SEO component
    "No. Overwatch warns after a control change lands onchain; it cannot stop or undo it. Its value is the time between a weakening, such as a removed timelock or a pre-signed transaction, and the moment funds move. In several recent losses those signs were onchain for days before any funds moved.", // SEO component
  ], // SEO component
  [
    // SEO component
    "How do I get Overwatch alerts?", // SEO component
    "Open the alerts page and choose a Telegram bot or signed webhooks, then pick the protocols and minimum severity you care about. Builders can also read grades and events from the JSON API.", // SEO component
  ], // SEO component
  [
    // SEO component
    "Can I verify Overwatch's data?", // SEO component
    "Yes. Every event and score records the account address and the slot it was read at, so anyone can check it against the chain, and the rules that turn accounts into grades are open source under the Apache 2.0 licence.", // SEO component
  ], // SEO component
]; // SEO component

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
  ["faq", "Questions"], // SEO component
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
    "Grade every drain power by keys to steal and usable delay, and take the worst. The rules are code in the repo (packages/core/src/ruleset), tested by 164 scenarios, 23 properties checked over 86,016 multisig setups, a brute-force oracle, and 4,000 random trees for unverified grades (lab/rules-v4.1).",
  ],
  [
    "Publish",
    "Write the score, grade and a flags bitmap to a RiskRecord account in the onchain registry, so any Solana program can read it.",
  ],
  ["Alert", "Send the event to Telegram, signed webhooks or email, and stream it over Server-Sent Events."],
];

/** The grid (ruleset v4): rows are keys an attacker must steal, columns the delay depositors can actually use. */
const GRID: [keys: string, cells: string[]][] = [
  ["1 key", ["F", "F", "D", "C", "B"]],
  ["2 keys", ["F", "D", "C", "B", "A"]],
  ["3 keys", ["D", "C", "C", "B", "A"]],
  ["4 or more", ["C", "C", "B", "B", "A"]],
];
const GRID_COLUMNS = ["no delay", "under 24h", "24h to 7d", "7 to 30d", "30d or more"];

const RULES: [string, string][] = [
  [
    "Every power that could drain the protocol is graded",
    "upgrade code, change risk settings, move funds, mint, set prices, bridge, stake",
  ],
  ["Each power is graded by its cheapest path", "fewest keys to steal, then shortest delay"],
  [
    "Usable delay = timelock minus the time depositors need to withdraw",
    "a delay shorter than the exit protects no one",
  ],
  ["The protocol takes the grade of its weakest power", "the page shows which one"],
  ["Red = a drain power grades F", "never set by flags alone"],
  ["A Squads config authority or open spending limit is its own path", "it can act without a vote"],
  ["A controller Overwatch cannot read", "unverified: no letter, unless what can be read is already D or F"],
  ["An A needs every expected power mapped", "otherwise B with a coverage note"],
  ["Blocking withdrawals (freeze)", "graded, never below D, never red"],
  ["Pausing new deposits", "listed, not graded"],
  ["A power that can only make things safer (lower limits, pause)", "listed, not graded, with the code that shows it"],
  ["A power the program caps under 5% of deposits", "graded, never below D, never red"],
  ["A power the deployed code has no instruction for", "listed, not graded; any redeploy voids this until re-checked"],
  ["Token issuers (USDC, LSTs)", "listed as a trust assumption, not graded"],
  ["Flags only, never the grade", "durable nonces, hot wallets, low thresholds, cancel rights, pending proposals"],
];

const GRADES: [g: string, range: string, word: string][] = [
  ["A", "score 95", "Strong: 30+ days to react, or immutable"],
  ["B", "score 80", "Good: a week or more to react, or many keys"],
  ["C", "score 65", "Caution"],
  ["D", "score 50", "Weak"],
  ["F", "score 20", "Dangerous: can be drained with no warning (red when it is a drain power)"],
];

const EVENTS: [string, string][] = [
  ["GRADE_LOWERED", "CRITICAL if now red · HIGH for 2+ grades or 2 below the 90-day best · else MEDIUM"],
  ["GRADE_RAISED", "INFO"],
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
      <JsonLd // SEO component
        data={[
          // SEO component
          breadcrumbs([["Documentation", "/docs"]]), // SEO component
          {
            // SEO component
            "@type": "TechArticle", // SEO component
            headline: "How Overwatch works: reading, scoring and alerting on Solana protocol controls", // SEO component
            description: DESCRIPTION, // SEO component
            url: `${SITE_URL}/docs`, // SEO component
            author: { "@id": ORGANIZATION_ID }, // SEO component
            publisher: { "@id": ORGANIZATION_ID }, // SEO component
          }, // SEO component
          {
            // SEO component
            "@type": "FAQPage", // SEO component
            mainEntity: FAQ.map(([question, answer]) => ({
              // SEO component
              "@type": "Question", // SEO component
              name: question, // SEO component
              acceptedAnswer: { "@type": "Answer", text: answer }, // SEO component
            })), // SEO component
          }, // SEO component
        ]} // SEO component
      />
      {/* SEO component */}
      <PageHero
        dock="Docs"
        lines={["Documentation"]}
        lede="What Overwatch watches, exactly how a grade is computed, and how depositors, builders and protocols use it. Every claim here is checkable against the code and the chain."
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
            Anyone can read it. In most large losses of 2026 attackers took control rather than breaking code (see the{" "}
            <Link href="/case-study">case studies</Link>), and the weakened controls were public before funds moved.
            Nobody was reading them on the depositor&apos;s behalf. Overwatch does.
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
            Watched accounts are read about every 15 seconds and each signer&apos;s new transactions about every minute,
            so most changes appear within a minute of confirming. Signers&apos; durable nonce accounts are found by an
            hourly scan, a full reconcile runs every five minutes, and after any downtime the indexer replays the
            transactions it missed.
          </p>

          <h2 id="scoring">Scoring and grades</h2>
          <p>
            Two numbers decide every grade: how many private keys an attacker must steal to drain the protocol, and how
            many days depositors would have to withdraw before the change takes effect. The 7-day and 30-day lines are
            the exit windows used by L2BEAT and DeFiScan; an A needs 30 usable days or immutable code, and one key never
            reaches A. Every grade is a deterministic function of facts on the protocol page.
          </p>
          <table className="dtable">
            <thead>
              <tr>
                <th>Keys to steal</th>
                {GRID_COLUMNS.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRID.map(([keys, cells]) => (
                <tr key={keys}>
                  <td>{keys}</td>
                  {cells.map((g, i) => (
                    <td key={i} className={`mono${g === "F" ? " bad" : ""}`}>
                      {g}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="dtable">
            <tbody>
              {RULES.map(([r, p]) => (
                <tr key={r}>
                  <td>{r}</td>
                  <td className="dim">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Where the rules are a judgement rather than a published standard (the steps below 7 days, the 5% spending
            limit line, the D floor for freezes), the lab in the repo records why. A grade change raises its own alert:
            CRITICAL when a protocol turns red, HIGH for a two-grade drop or a slow slide two grades below its 90-day
            best, MEDIUM for one grade.
          </p>
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
            nonce account, or the reverse, escalates to CRITICAL regardless of the grade. Pre-signed nonce transactions
            never expire, so signatures collected in advance can be used at any later moment.
          </p>

          <h2 id="flags">Flags and red</h2>
          <p>
            Each score is published with a u64 flags bitmap. A protocol is <b className="bad">red</b> when{" "}
            <span className="mono">flags &amp; RED_MASK != 0</span>, where RED_MASK ={" "}
            <span className="mono">0x{RED_MASK.toString(16)}</span>. Under ruleset v4 only bits 0 (one key can drain
            with no protective delay) and 10 (a drain power grades F) are set, so red means exactly what the grade says.
            Bits 4 and 11 belonged to the previous rules and are retired; the mask keeps its value so deployed programs
            keep working.
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
              timelock, the control that sets its grade, and its change history.
            </li>
            <li>
              Set up <Link href="/alerts">alerts</Link>. On Telegram, send{" "}
              <span className="mono">/watch kamino-lend</span>, <span className="mono">/list</span> or{" "}
              <span className="mono">/status kamino-lend</span> to the bot. Email and webhooks are on the same page.
              Pick a minimum severity so you only hear about what matters.
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
            Every grade names the control that sets it, and the fix is public: a longer timelock (7 days moves most
            setups up a grade, 30 days to A), more signers, or retiring a single-key authority. The grade updates on the
            next snapshot after the change confirms. Teams can watch their own programs and multisigs privately from the
            dashboard before anyone else sees a change.
          </p>
          <p>
            A protocol can never pay for a grade. Paid plans buy alert depth, webhooks, API access and private watches;
            the grading rules are the same for every protocol.
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
              The <Link href="/case-study">case studies</Link> describe past attacks from public reports. Where they say
              what Overwatch would have seen, that is an assessment or a backtest, not a live catch.
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

          <h2 id="faq">Questions</h2>
          {/* SEO component */}
          {FAQ.map(([question, answer]) => (
            // SEO component
            <div key={question}>
              {/* SEO component */}
              <h3>{question}</h3>
              {/* SEO component */}
              <p>{answer}</p>
              {/* SEO component */}
            </div> // SEO component
          ))}
          {/* SEO component */}
        </div>
      </section>
    </>
  );
}
