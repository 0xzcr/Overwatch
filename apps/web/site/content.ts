// Site copy. Everything describes what Overwatch does; nothing here is presented as live data.

export type Vis = "terminal" | "radar" | "code" | "gauge" | "chart" | "nodes" | "alerts" | "pipeline" | "toggles" | "bits" | "chat" | "ledger";
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

export const promise = "Know who can move your money.";

export const pages = [
  { href: "/", name: "Overview", kicker: "What Overwatch watches", shape: "orb", color: "#2BFFB0" },
  { href: "/protocols", name: "Control map", kicker: "Grades for the top Solana protocols", shape: "globe", color: "#2BFFB0" },
  { href: "/events", name: "Live events", kicker: "Every change, as it happens", shape: "radar", color: "#7CF3FF" },
  { href: "/case/drift", name: "Drift case", kicker: "9 days of warning", shape: "knot", color: "#FF5A3D" },
  { href: "/alerts", name: "Alerts", kicker: "Telegram · webhooks · email", shape: "burst", color: "#FFB547" },
  { href: "/vault", name: "Protected vault", kicker: "Devnet demo", shape: "lock", color: "#B6FF3B" },
  { href: "/demo", name: "Demo console", kicker: "Weaken the locks on devnet", shape: "lattice", color: "#D27DFF" },
  { href: "/methodology", name: "Methodology", kicker: "How grades are computed", shape: "shield", color: "#8B7CFF" },
  { href: "/docs/api", name: "API", kicker: "REST · SSE · webhooks · SDK", shape: "terrain", color: "#5AA8FF" },
] as const;

export const steps = [
  {
    num: "01",
    name: "Map",
    shape: "graph",
    color: "#2BFFB0",
    title: "Who can change the code.",
    text: "For every major protocol we decode the upgrade authority, the multisig behind it, how many signers must agree and how long a change has to wait. Every fact links to its raw account.",
  },
  {
    num: "02",
    name: "Watch",
    shape: "radar",
    color: "#7CF3FF",
    title: "Every key, every signer.",
    text: "We subscribe to those accounts and signers. A dropped timelock, a lower threshold, a new key or a signer holding never-expiring transactions shows up within seconds.",
  },
  {
    num: "03",
    name: "Warn & act",
    shape: "burst",
    color: "#FF5A3D",
    title: "Before the fire starts.",
    text: "A plain-English alert on Telegram, webhook or email. Scores are published onchain, so a vault can pull its funds automatically. Our devnet demo vault does exactly that.",
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
      "For each major Solana protocol: upgrade authority, multisig threshold, signers, timelock, durable-nonce exposure, admin powers, risky collateral and dead oracles, with a history of every governance change.",
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
    summary: "Real-time alerts on Telegram, signed webhooks or email the moment controls weaken, plus a versioned API and live event stream for curators, wallets, insurers and funds.",
  },
  {
    id: "registry",
    code: "03",
    chapter: "act",
    title: "Onchain registry & vault",
    vis: "code",
    color: "#B6FF3B",
    href: "/vault",
    cta: "Try the protected vault",
    summary: "Scores and risk flags live in PDAs any Solana program can read. A demo vault pulls its funds from a protocol, permissionlessly, the moment its flags turn red.",
    codeLines: [
      "  #[account(seeds = [b\"risk\", id.as_ref()], bump,",
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
    href: "/case/drift",
    cta: "Replay the Drift timeline",
    summary: "A weakening of controls within 14 days of a signer creating durable nonce accounts escalates to CRITICAL: the exact sequence that preceded the $285M Drift drain.",
    term: [
      ["i", "2026-03-23 signer-A, signer-B → durable nonce"],
      ["w", "SIGNER_NONCE_ACCOUNT_CREATED · CRITICAL (2/5 ≥ 2)"],
      ["i", "2026-03-27 council migration · 2-of-5 · no delay"],
      ["e", "⚠ Drift pattern: weakening within 14d of nonce"],
      ["s", "alert sent · 9 days before the drain"],
    ],
  },
];

export const eventTypes = [
  "TIMELOCK_REMOVED",
  "THRESHOLD_LOWERED",
  "UPGRADE_AUTHORITY_CHANGED",
  "AUTHORITY_BECAME_SINGLE_KEY",
  "SIGNER_NONCE_ACCOUNT_CREATED",
  "SIGNER_DURABLE_NONCE_TX",
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

/** "What does this mean?" tooltips. */
export const GLOSSARY: Record<string, string> = {
  multisig: "A wallet that needs several people to approve a transaction, for example 3 of 5. Safer than one key, if enough different people must sign.",
  timelock: "A mandatory waiting period between approving a change and it taking effect. It gives depositors time to withdraw if something bad is approved.",
  "durable nonce":
    "A Solana feature that lets a transaction be signed now and submitted any time later. Normal transactions expire in about a minute. The Drift attacker collected pre-signed durable-nonce transactions from signers days in advance.",
  "upgrade authority": "The key that can replace a program's code. Whoever holds it can change the rules, including how your deposit can be withdrawn.",
  threshold: "How many signers of a multisig must approve a change.",
  "config authority": "A Squads setting that lets one key change the multisig's signers, threshold and timelock instantly, without a vote.",
  "permanent delegate": "A Token-2022 power that lets the issuer move or burn tokens from any holder's account.",
  oracle: "The price feed a protocol uses to value collateral. A stale or manipulated oracle can let attackers borrow against fake value.",
  pda: "Program Derived Address: an address controlled by a program rather than a private key.",
};
