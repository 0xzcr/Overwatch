// Site copy. Everything describes what Overwatch does; nothing here is presented as live data.

/** Public origin for canonical URLs, social cards and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://overwatch1.xyz").replace(/\/$/, "");

/**
 * Shown on the landing page, under the navbar and on /alerts while monitoring is down, and switches off the bot link.
 * Empty while monitoring runs normally.
 */
export const MAINTENANCE_NOTICE = "";
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
  { href: "/", name: "Overview", kicker: "What Overwatch does", color: "#2BFFB0" },
  {
    href: "/protocols",
    name: "Control map",
    kicker: "Grades for the top Solana protocols",
    color: "#2BFFB0",
  },
  {
    href: "/events",
    name: "Live events",
    kicker: "Control changes as they land onchain",
    color: "#7CF3FF",
  },
  { href: "/case-study", name: "Case studies", kicker: "Ten control attacks, explained", color: "#FF5A3D" },
  { href: "/alerts", name: "Alerts", kicker: "Telegram, webhooks, email", color: "#FFB547" },
  {
    href: "/docs",
    name: "Documentation",
    kicker: "How it works, how grades are computed, how to use it",
    color: "#8B7CFF",
  },
  { href: "/docs/api", name: "API", kicker: "REST, SSE, webhooks, SDK", color: "#5AA8FF" },
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
    text: "We read those accounts every 15 seconds and the signers' transactions every minute. A removed timelock or lowered threshold shows up within a minute of confirming. Signers' durable nonce accounts are scanned hourly. We warn after a change lands; we cannot undo it.",
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
    id: "presigned",
    code: "04",
    chapter: "watch",
    title: "Pre-signed takeovers",
    vis: "terminal",
    color: "#FFB547",
    href: "/case-study",
    cta: "Read ten control attacks",
    summary:
      "Signers can sign a transaction now that runs any time later. If controls weaken within 14 days of a signer creating a durable nonce account, the alert is rated critical. The case studies show how attackers took control in ten recent losses.",
    term: [
      ["i", "signer-A, signer-B → durable nonce accounts"],
      ["w", "SIGNER_NONCE_ACCOUNT_CREATED · HIGH"],
      ["i", "multisig → 2-of-5 · no delay"],
      ["e", "⚠ weakening within 14d of a nonce · CRITICAL"],
      ["s", "alert sent: Telegram · webhook · email"],
    ],
  },
];

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
    "A Solana feature that lets a transaction be signed now and submitted any time later. Normal transactions expire in about a minute. Attackers have collected pre-signed transactions from signers days in advance.",
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
