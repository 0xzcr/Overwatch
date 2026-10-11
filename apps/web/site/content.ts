// Copy for the Overwatch landing site ("The Vigil Edition").
// Everything here describes what the code in this repo does today. Tags are honest:
// Live = mainnet, read-only. Devnet = the onchain registry/vault. Limited = partial coverage.

export type Tag = "Live" | "Devnet" | "Limited" | "Soon";
export type Vis = "terminal" | "radar" | "code" | "gauge" | "chart" | "nodes" | "alerts" | "pipeline" | "toggles" | "bits" | "chat" | "ledger";
export type TermLine = [kind: "$" | "i" | "w" | "e" | "s", text: string];
export type AlertLine = [lvl: "crit" | "high" | "med" | "info" | "ok", title: string, sub: string];

export interface Chapter {
  id: string;
  num: string;
  name: string;
  kicker: string;
  title: string;
  blurb: string;
  color: string;
  shape: string;
}

export interface Capability {
  id: string;
  code: string;
  chapter: string;
  title: string;
  tag: Tag;
  vis: Vis;
  featured: boolean;
  summary: string;
  detail: string;
  bullets: string[];
  term?: TermLine[];
  codeLines?: string[];
  alerts?: AlertLine[];
}

export const edition = {
  name: "The Vigil Edition",
  season: "Fall '26",
  promise: "Know who can move your money.",
};

export const chapters: Chapter[] = [
  {
    id: "map",
    num: "01",
    name: "Map",
    kicker: "The control map",
    title: "Know who can move your money.",
    blurb:
      "For every major Solana protocol we decode who can upgrade the code, which multisig controls it, how many signers must agree and how long a change has to wait. Everything comes straight from the chain, and every fact links to its raw account.",
    color: "#2BFFB0",
    shape: "graph",
  },
  {
    id: "watch",
    num: "02",
    name: "Watch",
    kicker: "Real-time rules engine",
    title: "Seconds, not post-mortems.",
    blurb:
      "We subscribe to every one of those accounts and every signer. When a timelock drops, a threshold falls, a key changes hands or a signer starts collecting never-expiring transactions, the rules engine sees it within seconds.",
    color: "#7CF3FF",
    shape: "radar",
  },
  {
    id: "score",
    num: "03",
    name: "Score",
    kicker: "Grades & methodology",
    title: "Facts first, opinions second.",
    blurb:
      "Every grade is a deterministic function of facts you can check. Start at 100, subtract for each weak lock, clamp. The rules are public and unit-tested, including a replay of the Drift timeline.",
    color: "#8B7CFF",
    shape: "shield",
  },
  {
    id: "warn",
    num: "04",
    name: "Warn",
    kicker: "Alerts",
    title: "Plain English, the moment it matters.",
    blurb:
      "Telegram, signed webhooks, email or a live event stream. Every alert says what changed, who it affects and why it matters, written for depositors rather than auditors.",
    color: "#FF5A3D",
    shape: "burst",
  },
  {
    id: "act",
    num: "05",
    name: "Act",
    kicker: "Onchain registry & vault",
    title: "When the grade turns red, money can move itself.",
    blurb:
      "Scores and risk flags are published onchain, so any program can read them. Our demo vault reads them too: when a protocol turns red, anyone can pull its position back to safety without asking permission.",
    color: "#B6FF3B",
    shape: "lock",
  },
  {
    id: "build",
    num: "06",
    name: "Build",
    kicker: "API, SDK & tooling",
    title: "Read the watch from anywhere.",
    blurb:
      "A versioned JSON API, a server-sent event stream, a TypeScript SDK and a Rust account type. Wire Overwatch into a dashboard, a bot, a risk desk or your own program.",
    color: "#5AA8FF",
    shape: "terrain",
  },
];

type Raw = Omit<Capability, "id" | "code" | "chapter" | "featured"> & { featured?: boolean };

const raw: Record<string, Raw[]> = {
  map: [
    {
      title: "Verified multisig mapping",
      tag: "Live",
      vis: "nodes",
      featured: true,
      summary: "We find the Squads multisig behind every upgrade key, then prove it is really the one in control.",
      detail:
        "Multisigs are found from the upgrade authority's transaction history. Each one is trusted only after we derive its vault PDAs (indices 0 to 7) and one of them matches the onchain upgrade authority. If nothing matches, the protocol is marked unverified.",
      bullets: ["Squads v4 decoded with @sqds/multisig", "Threshold, members, timelock and config authority", "Vault PDA re-derivation before anything is trusted"],
    },
    {
      title: "Upgrade authority decoding",
      tag: "Live",
      vis: "terminal",
      summary: "Who can replace the code, read directly from the BPF upgradeable loader.",
      detail:
        "We fetch the 36-byte Program account and the 45-byte ProgramData header with dataSlice, so the read is cheap. The authority is then classified as a single key, a Squads vault, Realms governance, a program-owned address or immutable. The layouts are checked against real mainnet fixtures.",
      bullets: ["Program and ProgramData layouts verified on mainnet fixtures", "Last deploy slot tracked for every program", "Immutable programs get no upgrade deductions"],
      term: [
        ["$", "pnpm inspect dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"],
        ["i", "program account 36 B · programdata header 45 B"],
        ["i", "upgrade_authority → SQUADS_V4_VAULT"],
        ["s", "verified: vault #0 matches onchain authority"],
        ["w", "squads_v4 7qip…JtM threshold=4/7 timelock=1h"],
        ["i", "grade A 85 · flags []"],
      ],
    },
    {
      title: "Durable nonce discovery",
      tag: "Live",
      vis: "radar",
      summary: "We find signers holding pre-signed transactions that never expire.",
      detail:
        "A durable nonce account is an 80-byte System account. If its authority (at offset 8) is one of a protocol's signers, that signer can sign transactions today that someone executes weeks later. We find them with a getProgramAccounts scan, live programSubscribe where the RPC allows it, and each signer's log stream.",
      bullets: ["Hourly full scan plus realtime subscriptions", "Every signer's transaction log is streamed", "This is exactly how the Drift drain was staged"],
    },
    {
      title: "Collateral token powers",
      tag: "Live",
      vis: "toggles",
      summary: "Can the issuer freeze, seize or block the collateral backing your deposit?",
      detail:
        "We parse Token-2022 mint extensions from the TLV data and flag the powers that matter to depositors: PermanentDelegate, TransferHook, DefaultAccountState (frozen) and Pausable, along with freeze authority.",
      bullets: ["Token-2022 TLV parsed per mint", "PermanentDelegate costs points in the score", "New risky powers raise a HIGH alert"],
    },
    {
      title: "Oracle provenance",
      tag: "Live",
      vis: "alerts",
      summary: "Which program owns each price feed, and whether its provider has shut down.",
      detail:
        "For each oracle account a protocol relies on, we check the owner program against known providers and flag deprecated ones. Stale prices from a shut-down feed can be used to borrow against value that does not exist.",
      bullets: ["Owner-program check on every feed", "Deprecated providers flagged", "Feeds into the DEPRECATED_ORACLE flag"],
      alerts: [
        ["high", "Relies on a shut-down price feed", "oracle 3vxL…9QpA · deprecated provider"],
        ["ok", "Feed owner verified", "Pyth receiver · 12 feeds"],
        ["info", "New oracle observed", "Switchboard On-Demand"],
      ],
    },
    {
      title: "Admin config adapters",
      tag: "Limited",
      vis: "code",
      summary: "Admin keys, listing authorities and risk parameters, decoded from each protocol's IDL.",
      detail:
        "IDL-driven adapters decode admin accounts such as Drift state, Kamino lending markets, marginfi groups and the Orca config. When an admin key changes or a new collateral token is listed, we know. A fake collateral listing was the final step of the Drift drain. Most protocols are not mapped yet, and we say so.",
      bullets: ["Adapters for Drift, Kamino, marginfi and Orca", "Collateral listings tracked", "Coverage gaps shown openly"],
      codeLines: [
        "  admin_accounts:",
        "    - adapter: drift-state",
        "-     admin: drift-admin (council vault)",
        "+     admin: 4Kx9…attacker",
        "+     listed: CVT (oracle: attacker-owned)",
        "      withdraw_guard: lifted",
      ],
    },
    {
      title: "Receipts for every fact",
      tag: "Live",
      vis: "terminal",
      summary: "Every claim on a protocol page links to the raw account it came from.",
      detail:
        "Upgrade authorities, multisigs, signers, nonce accounts, mints and oracles all link to the explorer. You never have to take our word for it.",
      bullets: ["Explorer links for every address", "Snapshot slot recorded", "Mainnet reads are read-only"],
      term: [
        ["i", "snapshot · kamino-lend"],
        ["i", "program KLend2g3…gmjD → explorer.solana.com"],
        ["i", "multisig 6hhB…fQbM 5/10 · timelock 1d"],
        ["i", "mints: USDC, JitoSOL, PYUSD (token-2022)"],
        ["s", "12 facts · 12 receipts"],
      ],
    },
    {
      title: "Unknown is not safe",
      tag: "Live",
      vis: "gauge",
      summary: "When we cannot attribute control, we say so, and it costs points.",
      detail:
        "Program-owned authorities we have not attributed, Realms DAOs and Squads v3 are labelled unmapped and lose 15 points. Silence should never read as a clean bill of health.",
      bullets: ["−15 for unmapped control", "UNVERIFIED flag published onchain", "6 of 15 mainnet protocols not fully mapped yet"],
    },
  ],
  watch: [
    {
      title: "Live account subscriptions",
      tag: "Live",
      vis: "radar",
      featured: true,
      summary: "Every program, multisig and signer is watched over WebSockets, with a reconciler behind it.",
      detail:
        "The indexer subscribes to each ProgramData account, each multisig and each signer's logs. Any change triggers a fresh snapshot, which is diffed against the last one by a pure, tested rules function. A periodic reconciler catches anything a socket missed.",
      bullets: ["Account and log subscriptions", "Pure diff: previous snapshot → typed events", "Reconciler for missed messages"],
    },
    {
      title: "Timelock removed or cut",
      tag: "Live",
      vis: "alerts",
      summary: "The safety delay is your time to withdraw. Losing it is CRITICAL.",
      detail:
        "TIMELOCK_REMOVED fires as CRITICAL: the signers can now change the program instantly. TIMELOCK_REDUCED fires as HIGH with the before and after durations.",
      bullets: ["TIMELOCK_REMOVED · CRITICAL", "TIMELOCK_REDUCED · HIGH", "Lengthening a timelock is reported too"],
      alerts: [
        ["crit", "Overwatch Demo removed its 2 days safety delay", "3 people can now change the program instantly"],
        ["high", "Shortened its safety delay to 12 hours", "was 2 days"],
        ["ok", "Lengthened its safety delay to 1 day", "good for depositors"],
      ],
    },
    {
      title: "Threshold lowered",
      tag: "Live",
      vis: "chart",
      summary: "Fewer people needed to approve a change means fewer people to compromise.",
      detail:
        "THRESHOLD_LOWERED is HIGH, and CRITICAL when the new threshold is two or fewer. A change of signers within seven days of a threshold change escalates to HIGH as well.",
      bullets: ["CRITICAL at threshold ≤ 2", "Signer changes escalate near threshold changes", "Raising a threshold is reported as good news"],
    },
    {
      title: "Upgrade key changes hands",
      tag: "Live",
      vis: "code",
      summary: "A new upgrade authority, or control collapsing to a single key, is CRITICAL.",
      detail:
        "UPGRADE_AUTHORITY_CHANGED and AUTHORITY_BECAME_SINGLE_KEY both fire as CRITICAL with the old and new authority. Whoever holds a single upgrade key can replace the code and move deposits.",
      bullets: ["Old and new authority in every alert", "Single-key control flagged instantly", "Made-immutable reported as good news"],
      codeLines: [
        "  program: Lending program",
        "- upgrade_authority: 6hhB…fQbM (Squads v4 vault #0)",
        "+ upgrade_authority: 2pXw…k8Rr (single key)",
        "  severity: CRITICAL",
        "  flags: +SINGLE_KEY  → RED",
      ],
    },
    {
      title: "Pending-vote early warning",
      tag: "Live",
      vis: "toggles",
      featured: true,
      summary: "We read pending Squads proposals and warn you before a weakening vote executes.",
      detail:
        "If a proposal would lower the threshold, cut the timelock or add a signer, PROPOSAL_WEAKENS_CONTROLS fires while it is still only a proposal. That is the earliest possible warning, and it costs the protocol 10 points until it is resolved.",
      bullets: ["ChangeThreshold, SetTimeLock and AddMember decoded", "Alert fires before execution", "PENDING_WEAKENING flag published"],
    },
    {
      title: "Signer nonce alerts",
      tag: "Live",
      vis: "alerts",
      summary: "A signer creating a durable nonce account is HIGH. Enough of them to pass a vote is CRITICAL.",
      detail:
        "SIGNER_NONCE_ACCOUNT_CREATED counts how many signers now hold never-expiring transactions and compares that with the threshold. When enough exposed signers exist to approve a change, the alert is CRITICAL.",
      bullets: ["Counts exposed signers against the threshold", "Closing a nonce is reported as good news", "Drives the SIGNER_NONCE red flag"],
      alerts: [
        ["crit", "Enough signers to pass a vote now hold never-expiring transactions", "2 of 5 exposed · threshold 2"],
        ["high", "A signer created a never-expiring transaction account", "signer-A · nonce-1"],
        ["ok", "A signer closed a durable nonce account", "nonce-2 no longer exists"],
      ],
    },
    {
      title: "The Drift pattern",
      tag: "Live",
      vis: "terminal",
      featured: true,
      summary: "Controls weakened within 14 days of a signer creating nonce accounts escalate to CRITICAL.",
      detail:
        "This compound rule encodes the sequence that preceded the $285M Drift drain: pre-signed, never-expiring transactions from council signers, then a weakening of controls. Either order, within 14 days, is CRITICAL and labelled 'Drift pattern'.",
      bullets: ["Looks back 14 days in both directions", "Labelled in every channel", "Covered by a unit test that replays Drift"],
      term: [
        ["i", "2026-03-23 signer-A, signer-B → durable nonce"],
        ["w", "SIGNER_NONCE_ACCOUNT_CREATED · CRITICAL (2/5 ≥ 2)"],
        ["i", "2026-03-27 council migration · 2-of-5 · no delay"],
        ["e", "⚠ Drift pattern: weakening within 14d of nonce"],
        ["s", "alert sent · 9 days before the drain"],
      ],
    },
    {
      title: "Config authority & signer changes",
      tag: "Live",
      vis: "nodes",
      summary: "One key that can rewrite the multisig without a vote is a hidden admin.",
      detail:
        "CONFIG_AUTHORITY_SET fires when a Squads multisig gains a config authority: a single key that can change signers, threshold and delay instantly. MEMBERS_CHANGED lists every signer added or removed.",
      bullets: ["CONFIG_AUTHORITY_SET · HIGH", "MEMBERS_CHANGED with added/removed keys", "Multisigs compared by role, so migrations count"],
    },
    {
      title: "Program upgrades",
      tag: "Live",
      vis: "pipeline",
      summary: "New code deployed to a program you use. Routine, unless nobody announced it.",
      detail:
        "PROGRAM_UPGRADED fires as MEDIUM with the new deploy slot. Routine upgrades are normal; unannounced ones deserve a look. Backfill walks about 180 days of history so every protocol starts with a timeline.",
      bullets: ["Deploy slot diffed every snapshot", "180-day historical backfill", "Upgrades via Squads vault CPIs parsed too"],
    },
  ],
  score: [
    {
      title: "A deterministic 0–100 grade",
      tag: "Live",
      vis: "gauge",
      featured: true,
      summary: "Start at 100, subtract for each weak lock, clamp. Same facts, same grade, every time.",
      detail:
        "A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F below. Colour is always paired with the letter and a word, so the grade never relies on colour alone. The scoring function lives in packages/core and every rule has a unit test.",
      bullets: ["Grades A–F with words: Strong, Good, Caution, Weak, Dangerous", "Pure function of the snapshot and recent events", "Every rule unit-tested"],
    },
    {
      title: "Published deductions",
      tag: "Live",
      vis: "ledger",
      summary: "Every point lost is listed with the reason, so a protocol knows how to earn it back.",
      detail:
        "Single upgrade key −60. No timelock −25, under 24 hours −15, under 48 hours −5. Threshold of two or fewer −20. Controlled multisig −20. Each signer with a durable nonce −10, up to −30. Pending weakening vote −10. Recent HIGH or CRITICAL weakening −10. Risky collateral or deprecated oracle −10 each, up to −20. Unmapped control −15.",
      bullets: ["Weakest relevant multisig counts, not the average", "Breakdown served by the API", "Methodology versioned"],
    },
    {
      title: "Risk flags, as a u64",
      tag: "Live",
      vis: "bits",
      summary: "Twelve bits that any program, bot or dashboard can test in one instruction.",
      detail:
        "SINGLE_KEY, NO_TIMELOCK, LOW_THRESHOLD, CONTROLLED_MULTISIG, SIGNER_NONCE, PENDING_WEAKENING, RECENT_WEAKENING, RISKY_COLLATERAL, DEPRECATED_ORACLE, UNVERIFIED and two derived bits. Bit positions are part of the public API.",
      bullets: ["Same bit layout in TypeScript and Rust", "Published onchain with every score", "Derived bits keep onchain checks simple"],
    },
    {
      title: "RED_MASK",
      tag: "Live",
      vis: "code",
      summary: "One mask that answers the only question that matters: should money leave?",
      detail:
        "A protocol is red when one key can upgrade it, when a signer holds a durable nonce, when it has no timelock and a threshold of two or fewer on the same multisig, or after a recent CRITICAL weakening. Onchain programs check flags & RED_MASK != 0.",
      bullets: ["RED_MASK = 0xC11", "Derived bits 10 and 11 make it a plain mask", "Used by the demo vault's exit rule"],
      codeLines: [
        "  pub const RED_MASK: u64 =",
        "      SINGLE_KEY | SIGNER_NONCE",
        "    | NO_TIMELOCK_LOW_THRESHOLD",
        "    | RECENT_CRITICAL;",
        "+ if risk.flags & RED_MASK != 0 { exit() }",
      ],
    },
    {
      title: "Weakest link, not the average",
      tag: "Live",
      vis: "chart",
      summary: "Threshold and timelock deductions use the weakest multisig that controls something.",
      detail:
        "A protocol with one strong council and one weak admin multisig is graded on the weak one. Multisigs that only control already-immutable programs are ignored.",
      bullets: ["Worst threshold ratio and shortest timelock", "Immutable-only multisigs ignored", "Fewer than half the signers costs 10 points"],
    },
    {
      title: "Score history",
      tag: "Live",
      vis: "chart",
      summary: "Every recompute is stored, so you can see when a protocol got safer or riskier.",
      detail:
        "Scores are recorded on every change and served at /api/v1/scores/:slug/history, so trends are visible and auditable.",
      bullets: ["Per-protocol score timeline", "Flags stored with each point", "Queryable through the API"],
    },
  ],
  warn: [
    {
      title: "Telegram bot",
      tag: "Live",
      vis: "chat",
      featured: true,
      summary: "Watch the protocols you use and get alerts in the chat you already read.",
      detail:
        "/watch drift subscribes you. /severity sets the bar from LOW to CRITICAL. /status gives the grade, authority, multisig and last changes. /wallet finds liquid-staking positions you hold and subscribes you to them.",
      bullets: ["/watch · /unwatch · /list · /severity · /status · /wallet", "HTML-formatted, link to the evidence", "Default bar: HIGH and above"],
    },
    {
      title: "Plain-English alerts",
      tag: "Live",
      vis: "alerts",
      summary: "Written for the people whose money is at stake, not only for auditors.",
      detail:
        "Every event carries a sentence a depositor can act on. For example: 'Approving a change used to take 4 people; now 2 out of 5 are enough. Fewer people need to be compromised or collude to move funds.'",
      bullets: ["Before and after in every alert", "What it means for depositors", "Severity paired with words, not just colour"],
      alerts: [
        ["crit", "Overwatch Demo now needs only 2 of 5 signatures", "used to take 4 people · fewer to compromise"],
        ["high", "A single key can now rewrite Overwatch Demo's multisig", "can change signers, threshold and delay"],
        ["med", "Overwatch Demo deployed new code to its program", "unannounced upgrades deserve a look"],
      ],
    },
    {
      title: "Signed webhooks",
      tag: "Live",
      vis: "terminal",
      summary: "HMAC-SHA256 signed, retried with backoff, verifiable in one line.",
      detail:
        "Each delivery carries x-overwatch-signature, the hex HMAC-SHA256 of the raw body. Failed deliveries retry with exponential backoff (10s, 20s, 40s…) up to six attempts. You can test-fire a signed sample payload from the API.",
      bullets: ["x-overwatch-signature header", "Six attempts with exponential backoff", "Test-fire endpoint for integration"],
      term: [
        ["$", "POST /api/v1/subscriptions/webhook"],
        ["i", '{"min_severity":"HIGH","protocols":["drift"]}'],
        ["s", "201 · secret returned once"],
        ["i", "delivery 1 → HTTP 503 · retry in 10s"],
        ["s", "delivery 2 → HTTP 200 · signature ok"],
      ],
    },
    {
      title: "Email alerts",
      tag: "Live",
      vis: "alerts",
      summary: "The same alerts in your inbox, for the protocols you choose.",
      detail: "Subscribe an address to one or more protocols with a minimum severity. Delivery shares the same retry worker as webhooks.",
      bullets: ["Per-protocol subscriptions", "Minimum severity filter", "Shared retry worker"],
      alerts: [
        ["crit", "[CRITICAL] Removed its 2 days safety delay", "to: treasury@yourdao.xyz"],
        ["info", "Subscription confirmed", "drift, kamino-lend · HIGH+"],
      ],
    },
    {
      title: "Live event stream",
      tag: "Live",
      vis: "terminal",
      summary: "Server-sent events for every event, score change, registry publish and vault shield.",
      detail: "curl -N /api/v1/stream and you receive event, score, registry and shield messages as they happen, powered by Postgres LISTEN/NOTIFY.",
      bullets: ["event · score · registry · shield", "Plain SSE, works with curl", "Backed by LISTEN/NOTIFY"],
      term: [
        ["$", "curl -N /api/v1/stream"],
        ["i", "event: score  {slug:'raydium', grade:'B', score:75}"],
        ["w", "event: event  {severity:'HIGH', type:'MEMBERS_CHANGED'}"],
        ["s", "event: registry {slug:'overwatch-demo', tx:'5Kp…'}"],
        ["e", "event: shield {vault:'demo', position:'overwatch-demo'}"],
      ],
    },
    {
      title: "Severity you control",
      tag: "Live",
      vis: "toggles",
      summary: "LOW, MEDIUM, HIGH or CRITICAL, per subscription.",
      detail: "Treasuries might want everything. Depositors might want only CRITICAL. Every channel takes a minimum severity, and strengthening events are reported as INFO.",
      bullets: ["Per-channel minimum severity", "INFO events for good news", "Change it anytime with /severity"],
    },
  ],
  act: [
    {
      title: "Onchain risk registry",
      tag: "Devnet",
      vis: "code",
      featured: true,
      summary: "A RiskRecord per protocol, at a PDA any Solana program can read.",
      detail:
        "Publishers write score, grade and flags to PDA ['risk', sha256(slug)] under the registry program. Programs read it with an owner check and a PDA check, then test the flags. Publishing is debounced to at most once a minute per protocol, unless the change is critical.",
      bullets: ["PDA: ['risk', sha256(slug)]", "Score, grade, flags, slot", "Critical changes publish immediately"],
      codeLines: [
        "  #[account(seeds = [b\"risk\", id.as_ref()], bump,",
        "            seeds::program = overwatch_registry::ID)]",
        "  pub risk: Account<'info, RiskRecord>,",
        "",
        "+ require!(risk.flags & RED_MASK == 0, Exit);",
      ],
    },
    {
      title: "Publisher trust model",
      tag: "Devnet",
      vis: "nodes",
      summary: "Up to five publisher keys, chosen by a Squads multisig. We watch our own registry too.",
      detail:
        "The registry admin is a multisig, and it can add or remove up to five publishers and pause publishing. Overwatch applies its own rules to its own registry, because a watcher should be watched.",
      bullets: ["Max 5 publishers", "Multisig-controlled admin", "Registry is itself on the watch list"],
    },
    {
      title: "Shielded vault",
      tag: "Devnet",
      vis: "pipeline",
      featured: true,
      summary: "A vault that pulls positions back to idle the moment a protocol turns red.",
      detail:
        "check_and_exit is permissionless: anyone can call it, and it moves a position back to idle when the protocol's RiskRecord is red or its score drops below the vault's minimum. Positions in the demo are simulated allocations, not real protocol integrations.",
      bullets: ["Exit on red flags or score < min_score", "Anyone can trigger it, no keeper monopoly", "Demo allocations are simulated"],
    },
    {
      title: "Keeper",
      tag: "Devnet",
      vis: "terminal",
      summary: "The indexer runs a keeper that triggers the exit when the registry turns red.",
      detail:
        "When a published score goes red, the keeper sends check_and_exit and records the shield event, which also appears on the live stream. When the protocol recovers, the vault is re-armed.",
      bullets: ["ShieldTriggered events on the stream", "Automatic re-arm on recovery", "End-to-end tested on devnet"],
      term: [
        ["e", "TIMELOCK_REMOVED · overwatch-demo · CRITICAL"],
        ["i", "registry publish → flags 0x402 · red"],
        ["$", "check_and_exit(position=overwatch-demo)"],
        ["s", "ShieldTriggered · 100% → idle"],
        ["i", "re-armed after recovery"],
      ],
    },
    {
      title: "Demo protocol on devnet",
      tag: "Devnet",
      vis: "toggles",
      summary: "A real Squads multisig and program on devnet, built to have its locks removed on purpose.",
      detail:
        "Scripts remove the timelock, lower the threshold, transfer upgrade authority or create a signer nonce on the demo protocol, so you can watch the alert, the registry update and the vault exit happen live.",
      bullets: ["Remove timelock · lower threshold", "Transfer authority · create signer nonce", "Reset to a clean epoch"],
    },
  ],
  build: [
    {
      title: "Public REST API",
      tag: "Live",
      vis: "terminal",
      featured: true,
      summary: "Protocols, events, score history and subscriptions, as versioned JSON.",
      detail:
        "Every response is { version, data }. Anonymous use allows 30 requests a minute; API keys raise the limit by tier. Endpoints: /protocols, /protocols/:slug, /protocols/:slug/events, /events, /scores/:slug/history, /stream and /subscriptions.",
      bullets: ["Versioned responses", "30 req/min anonymous, keyed tiers above", "Full control snapshot per protocol"],
      term: [
        ["$", "curl -s /api/v1/protocols/drift | jq .data"],
        ["i", '{ "grade": "A", "score": 85,'],
        ["i", '  "threshold": "4-of-7", "timelockSec": 3600,'],
        ["i", '  "authorityKind": "SQUADS_V4_VAULT",'],
        ["s", '  "flagNames": [] }'],
      ],
    },
    {
      title: "TypeScript SDK",
      tag: "Live",
      vis: "code",
      summary: "Read RiskRecords, call the API, verify webhooks and build registry or vault instructions.",
      detail:
        "@overwatch/sdk exposes fetchRiskRecord, an OverwatchClient for the API, verifyWebhook for signatures, and instruction builders for the registry and vault programs.",
      bullets: ["fetchRiskRecord(rpc, slug)", "OverwatchClient · verifyWebhook", "RegistryIx / VaultIx builders"],
      codeLines: [
        "  import { fetchRiskRecord } from \"@overwatch/sdk\";",
        "",
        "  const r = await fetchRiskRecord(rpc, \"drift\");",
        "+ if (r.red) await exit(position);",
        "  // { score, grade, flags, red, slot }",
      ],
    },
    {
      title: "Rust account type",
      tag: "Devnet",
      vis: "code",
      summary: "Read the registry from your own program with Anchor's owner and seed checks.",
      detail: "Import overwatch_registry, declare the RiskRecord account with its seeds and program, and test the flags. The flag constants mirror the TypeScript ones bit for bit.",
      bullets: ["Account<'info, RiskRecord>", "flags::RED_MASK constant", "Owner + PDA checks via Anchor"],
      codeLines: [
        "  use overwatch_registry::{flags::RED_MASK, RiskRecord};",
        "",
        "  let risk = &ctx.accounts.risk;",
        "+ if risk.score < vault.min_score",
        "+   || risk.flags & RED_MASK != 0 { pull_to_idle()?; }",
      ],
    },
    {
      title: "inspect CLI",
      tag: "Live",
      vis: "terminal",
      summary: "A read-only control report for any Solana program, from your terminal.",
      detail: "pnpm inspect <programId> decodes the upgrade authority, finds and verifies the Squads multisig and prints the grade and flags. It does not need a database.",
      bullets: ["Any program ID, mainnet or devnet", "Optional --multisig override", "Same rules as the live engine"],
      term: [
        ["$", "pnpm inspect So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo"],
        ["i", "upgrade_authority → SINGLE_KEY"],
        ["e", "−60 A program can be upgraded by one private key"],
        ["e", "grade D 40 · flags [SINGLE_KEY] · RED"],
      ],
    },
    {
      title: "Historical backfill",
      tag: "Live",
      vis: "pipeline",
      summary: "About 180 days of authority and multisig history, parsed from mainnet.",
      detail:
        "pnpm backfill walks signatures for every watched multisig and ProgramData account, parsing loader Upgrade and SetAuthority instructions and Squads config executions, including those made through vault CPIs.",
      bullets: ["Upgrade · SetAuthority · SetAuthorityChecked", "Squads config transactions", "Configurable --days and --max"],
    },
    {
      title: "Webhook verification",
      tag: "Live",
      vis: "code",
      summary: "Verify a delivery in one call, with no dependencies.",
      detail: "verifyWebhook(rawBody, signature, secret) recomputes the HMAC-SHA256 with WebCrypto and compares it with the header, so it runs anywhere crypto.subtle exists.",
      bullets: ["WebCrypto, no dependencies", "Hex HMAC-SHA256 of the raw body", "Ships in @overwatch/sdk"],
      codeLines: [
        "  const ok = await verifyWebhook(",
        "    rawBody,",
        "    req.headers[\"x-overwatch-signature\"],",
        "    process.env.OVERWATCH_SECRET);",
        "+ if (!ok) return new Response(null, { status: 401 });",
      ],
    },
  ],
};

let n = 100;
export const capabilities: Capability[] = chapters.flatMap((c) =>
  (raw[c.id] ?? []).map((u) => {
    n += 1 + ((n * 7) % 5);
    const slug = u.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return { ...u, id: `${c.id}-${slug}`, code: `OW-${String(n).padStart(4, "0")}`, chapter: c.id, featured: !!u.featured };
  }),
);

export const chapterById: Record<string, Chapter> = Object.fromEntries(chapters.map((c) => [c.id, c]));

export const eventTypes = [
  "TIMELOCK_REMOVED",
  "THRESHOLD_LOWERED",
  "UPGRADE_AUTHORITY_CHANGED",
  "AUTHORITY_BECAME_SINGLE_KEY",
  "SIGNER_NONCE_ACCOUNT_CREATED",
  "CONFIG_AUTHORITY_SET",
  "PROPOSAL_WEAKENS_CONTROLS",
  "MEMBERS_CHANGED",
  "PROGRAM_UPGRADED",
  "COLLATERAL_RISKY_EXTENSION",
  "ORACLE_DEPRECATED",
  "ADMIN_PARAM_CHANGED",
];

export const manifesto =
  "Drift lost $285M in twelve minutes, and no smart contract had a bug. The attacker collected pre-signed transactions from two of five council signers and waited. Every step happened on-chain, in public, for nine days. Nobody was watching the locks. Overwatch watches the locks.";

export const flagBits = [
  "SINGLE_KEY",
  "NO_TIMELOCK",
  "LOW_THRESHOLD",
  "CONTROLLED_MULTISIG",
  "SIGNER_NONCE",
  "PENDING_WEAKENING",
  "RECENT_WEAKENING",
  "RISKY_COLLATERAL",
  "DEPRECATED_ORACLE",
  "UNVERIFIED",
  "NO_TIMELOCK_LOW_THRESHOLD",
  "RECENT_CRITICAL",
];
