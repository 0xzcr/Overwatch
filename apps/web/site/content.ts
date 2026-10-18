// Site copy. Everything describes what Overwatch does; nothing here is presented as live data.

/** Public origin for canonical URLs, social cards and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://overwatch-chi.vercel.app").replace(/\/$/, "");
export const REPO_URL = "https://github.com/0xzcr/Overwatch";

export type Vis =
  | "terminal"
  | "radar"
  | "code"
  | "gauge"
  | "chart"
  | "nodes"
  | "alerts"
  | "pipeline"
  | "toggles"
  | "bits"
  | "chat"
  | "ledger";
export type TermLine = [kind: "$" | "i" | "w" | "e" | "s", text: string];
export type AlertLine = [lvl: "crit" | "high" | "med" | "info" | "ok", title: string, sub: string];

/** Input for the animated product mockups in visuals.ts. `chapter` picks the mockup variant. */
export interface Capability {
  id: string;
  code: string;
  chapter: string;
  title: string;
  vis: Vis;
  summary: string;
  term?: TermLine[];
  codeLines?: string[];
  alerts?: AlertLine[];
}

export const pages = [
  { href: "/", name: "Overview", kicker: "What Overwatch does", shape: "orb", color: "#2BFFB0" },
  {
    href: "/protocols",
    name: "Control map",
    kicker: "Grades for the top Solana protocols",
    shape: "globe",
    color: "#2BFFB0",
  },
  {
    href: "/events",
    name: "Live events",
    kicker: "Control changes as they land onchain",
    shape: "radar",
    color: "#7CF3FF",
  },
  { href: "/case-study", name: "Case study", kicker: "The Drift exploit, replayed", shape: "knot", color: "#FF5A3D" },
  { href: "/alerts", name: "Alerts", kicker: "Telegram, webhooks, email", shape: "burst", color: "#FFB547" },
  {
    href: "/docs",
    name: "Documentation",
    kicker: "How it works, how grades are computed, how to use it",
    shape: "shield",
    color: "#8B7CFF",
  },
  { href: "/docs/api", name: "API", kicker: "REST, SSE, webhooks, SDK", shape: "terrain", color: "#5AA8FF" },
] as const;

export const steps = [
  {
    num: "01",
    name: "Map",
    title: "Who controls each protocol",
    text: "For each major protocol we read the upgrade authority, the multisig behind it, how many signers must approve a change, and how long that change waits. Each fact links to the account it came from.",
  },
  {
    num: "02",
    name: "Watch",
    title: "Changes as they happen",
    text: "We subscribe to those accounts and signers. A removed timelock or lowered threshold shows up seconds after it confirms. Signers' durable nonce accounts are scanned hourly. We warn after a change lands; we cannot undo it.",
  },
  {
    num: "03",
    name: "Warn",
    title: "Alerts and onchain scores",
    text: "Alerts go to Telegram, a webhook or email, written in plain English. Scores are also stored onchain, so a vault program can act without waiting for a person.",
  },
] as const;

/** The three product layers, shown in the horizontal headliners strip. */
export const layers: (Capability & { href: string; cta: string; color: string })[] = [
  {
    id: "control-map",
    code: "01",
    chapter: "map",
    title: "Control map",
    vis: "nodes",
    color: "#2BFFB0",
    href: "/protocols",
    cta: "Open the control map",
    summary:
      "For each major Solana protocol: upgrade authority, multisig threshold, signers, timelock, durable-nonce exposure, admin powers, risky collateral, dead oracles, and the full history of governance changes.",
  },
  {
    id: "alerts",
    code: "02",
    chapter: "warn",
    title: "Alerts & API",
    vis: "chat",
    color: "#FF5A3D",
    href: "/alerts",
    cta: "Set up alerts",
    summary:
      "Alerts on Telegram, signed webhooks or email when a protocol's controls weaken. There is also a versioned API and a live event stream.",
  },
  {
    id: "registry",
    code: "03",
    chapter: "act",
    title: "Onchain registry",
    vis: "code",
    color: "#B6FF3B",
    href: "/docs#onchain",
    cta: "Read how programs use it",
    summary:
      "Scores and risk flags are stored in accounts any Solana program can read, so a vault can pull deposits out the moment a protocol's flags turn red.",
    codeLines: [
      '  #[account(seeds = [b"risk", id.as_ref()], bump,',
      "            seeds::program = overwatch_registry::ID)]",
      "  pub risk: Account<'info, RiskRecord>,",
      "",
      "+ if risk.flags & RED_MASK != 0 { check_and_exit()?; }",
    ],
  },
  {
    id: "drift",
    code: "04",
    chapter: "watch",
    title: "The Drift pattern",
    vis: "terminal",
    color: "#FFB547",
    href: "/case-study",
    cta: "Replay the Drift timeline",
    summary:
      "If controls weaken within 14 days of a signer creating durable nonce accounts, the alert is rated critical. That is the sequence that came before the $285M Drift loss. The replay is a backtest of current rules on the public record.",
    term: [
      ["i", "2026-03-23 signer-A, signer-B → durable nonce"],
      ["w", "SIGNER_NONCE_ACCOUNT_CREATED · CRITICAL (2/5 ≥ 2)"],
      ["i", "2026-03-27 council migration · 2-of-5 · no delay"],
      ["e", "⚠ Drift pattern: weakening within 14d of nonce"],
      ["s", "backtest: flagged 9 days before the drain"],
    ],
  },
];

export const manifesto =
  "Drift lost $285M in about twelve minutes, and no smart contract bug was needed. The attacker collected pre-signed transactions from two of five council signers and waited. Every step was public on Solana for nine days, and nobody was monitoring the controls. Overwatch monitors them.";

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

/** "What does this mean?" tooltips. */
export const GLOSSARY: Record<string, string> = {
  multisig:
    "A wallet that needs several people to approve a transaction, for example 3 of 5. Safer than one key, if enough different people must sign.",
  timelock:
    "A mandatory waiting period between approving a change and it taking effect. It gives depositors time to withdraw if something bad is approved.",
  "durable nonce":
    "A Solana feature that lets a transaction be signed now and submitted any time later. Normal transactions expire in about a minute. The Drift attacker collected pre-signed durable-nonce transactions from signers days in advance.",
  "upgrade authority":
    "The key that can replace a program's code. Whoever holds it can change the rules, including how your deposit can be withdrawn.",
  threshold: "How many signers of a multisig must approve a change.",
  "config authority":
    "A Squads setting that lets one key change the multisig's signers, threshold and timelock instantly, without a vote.",
  "permanent delegate": "A Token-2022 power that lets the issuer move or burn tokens from any holder's account.",
  oracle:
    "The price feed a protocol uses to value collateral. A stale or manipulated oracle can let attackers borrow against fake value.",
  pda: "Program Derived Address: an address controlled by a program rather than a private key.",
};
