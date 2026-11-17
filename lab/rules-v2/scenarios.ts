/**
 * Real-world scenarios for the proposed ruleset. Expected results come from the written spec, decided before the
 * engine was run. "Modelled on" means the setup copies the shape of a real incident, not its exact parameters.
 */
import type { Authority, Protocol } from "./model";
import { DAY, HOUR } from "./model";
import type { Event, Tick } from "./engine";
import { deliver, monitorSilent, redPublishable, smoothGrades } from "./engine";
import {
  at,
  control,
  dao,
  expectEvents,
  expectPosture,
  expectTrue,
  immutable,
  key,
  keys,
  multisig,
  proposal,
  protocol,
  replay,
  squads,
  T0,
  unknown,
  vaultProtocol,
} from "./harness";

export interface Scenario {
  group: string;
  id: string;
  title: string;
  check: () => string[];
}

const scenario = (group: string, id: string, title: string, check: () => string[]): Scenario => ({
  group,
  id,
  title,
  check,
});

// ───────────────────────────── the 15 live protocols (from the production API, 2026-11-09) ─────────────────────────────

const LIVE = "Live protocols";

const live: Scenario[] = [
  scenario(LIVE, "kamino", "Kamino 5-of-10, 24h", () => expectPosture(squads("kamino", 5, 10, DAY), { grade: "A" })),
  scenario(LIVE, "jup-perps", "Jupiter Perps 4-of-8, 24h", () =>
    expectPosture(squads("jp", 4, 8, DAY), { grade: "A" }),
  ),
  scenario(LIVE, "orca", "Orca 5-of-13, 24h", () => expectPosture(squads("orca", 5, 13, DAY), { grade: "A" })),
  scenario(LIVE, "jup-lend", "Jupiter Lend 4-of-6, 12h", () =>
    expectPosture(squads("jl", 4, 6, 12 * HOUR), { grade: "B", red: false }),
  ),
  scenario(LIVE, "drift-now", "Drift today 4-of-7, 1h", () =>
    expectPosture(squads("drift", 4, 7, HOUR), { grade: "B", red: false }),
  ),
  scenario(LIVE, "marginfi", "marginfi 7-of-15, no delay", () =>
    expectPosture(squads("mfi", 7, 15, 0), { grade: "C", red: false }),
  ),
  scenario(LIVE, "raydium", "Raydium 3-of-4, no delay", () =>
    expectPosture(squads("ray", 3, 4, 0), { grade: "D", red: false }),
  ),
  scenario(LIVE, "save", "Save: one upgrade key", () =>
    expectPosture(protocol("save", [control("CODE", key("save-admin"))]), { grade: "F", red: true }),
  ),
  scenario(LIVE, "unmapped", "Jito-style controller we cannot decode", () =>
    expectPosture(protocol("jito", [control("CODE", unknown("jito-pda"))]), {
      grade: "C",
      provisional: true,
      red: false,
    }),
  ),
];

// ───────────────────────────── past attacks ─────────────────────────────

const PAST = "Past attacks";

/** Modelled on Drift (Apr 2026). The prior 3-of-5 / 24h council is an assumption; the rest follows the case study. */
function driftTimeline(): string[] {
  const signers = keys("d", 5);
  const council = (threshold: number, timelock: number, nonce: boolean) =>
    multisig(
      "drift-council",
      threshold,
      signers.map((s, i) => ({ ...s, nonce: nonce && i < 2 })),
      timelock,
    );
  const state = (
    threshold: number,
    timelock: number,
    nonce: boolean,
    admin: Authority = council(threshold, timelock, nonce),
  ) =>
    protocol("drift", [
      control("CODE", council(threshold, timelock, nonce)),
      control("FUNDS", council(threshold, timelock, nonce)),
      control("RISK", admin),
    ]);
  const attacker = key("drift-attacker", { fresh: true });
  const hijacked = state(2, 0, true, attacker);
  const transfer = proposal({
    id: "admin-transfer",
    createdAt: at(12, 12),
    threshold: 2,
    approvals: [
      { at: at(12, 12, 0, 1), durableNonce: true },
      { at: at(12, 12, 0, 1), durableNonce: true },
    ],
    approvedAt: at(12, 12, 0, 1),
    touches: ["RISK"],
    after: hijacked,
  });
  const ticks: Tick[] = [
    { at: at(0), state: state(3, DAY, false) },
    { at: at(3), state: state(3, DAY, true), signals: [{ type: "nonce_created" }] },
    { at: at(7), state: state(2, 0, true) },
    { at: at(12, 12), proposals: [transfer] },
    { at: at(12, 12, 0, 2), state: hijacked, proposals: [{ ...transfer, executed: true }] },
    {
      at: at(12, 12, 1),
      signals: [{ type: "listing", ageDays: 0, singleKeyMint: true, protocolOracle: true, liquidityBelowCap: true }],
    },
    { at: at(12, 12, 5), signals: [{ type: "outflow", share: 0.6, to: "new" }] },
  ];
  const { monitor, redAfter } = replay(ticks);
  return [
    ...expectTrue(!redAfter[1], "should not be red after one signer prepares"),
    ...expectTrue(!!redAfter[2], "should be red the day the council drops to 2-of-5 with no delay (5 days early)"),
    ...expectEvents(monitor.events, {
      has: [
        { type: "SIGNER_NONCE_CREATED", step: "prepare" },
        { type: "WEAKENED", severity: "CRITICAL", step: "control" },
        { type: "TAKEOVER_SETUP" },
        { type: "PRESIGNED_APPROVALS", severity: "CRITICAL" },
        { type: "CONTROL_MOVED", severity: "CRITICAL", capability: "RISK" },
        { type: "TAKEOVER", severity: "CRITICAL" },
        { type: "INCIDENT" },
      ],
    }),
  ];
}

/** An attack that lands on a protocol: control taken (optional), then an upgrade, then funds leave. */
function strike(before: Protocol, takeover?: Protocol) {
  const ticks: Tick[] = [
    { at: at(0), state: before },
    ...(takeover ? [{ at: at(1), state: takeover }] : []),
    { at: at(1, 0, 1), signals: [{ type: "upgrade", verified: false, staged: false }] },
    { at: at(1, 0, 10), signals: [{ type: "outflow", share: 0.8, to: "new" }] },
  ];
  return replay(ticks);
}

const past: Scenario[] = [
  scenario(PAST, "drift-2026", "Drift (2026): pre-signed approvals, 2-of-5 with no delay, fake listing", driftTimeline),

  scenario(PAST, "radiant-2024", "Radiant (2024): 3-of-11, no delay, ownership moved, upgrade, drain", () => {
    const before = squads("radiant", 3, 11, 0);
    const owned = vaultProtocol("radiant", key("radiant-attacker", { fresh: true }));
    const { monitor, redAfter } = strike(before, owned);
    return [
      ...expectPosture(before, { grade: "F", red: true }),
      ...expectTrue(!!redAfter[0], "red before the attack"),
      ...expectEvents(monitor.events, {
        has: [{ type: "CONTROL_MOVED", min: "HIGH" }, { type: "TAKEOVER" }, { type: "INCIDENT" }],
      }),
    ];
  }),

  scenario(PAST, "bybit-2025", "Bybit-style (2025): 3-of-6, no delay, disguised upgrade, drain", () => {
    const before = squads("bybit", 3, 6, 0);
    const { monitor, redAfter } = strike(before);
    return [
      ...expectPosture(before, { grade: "D", red: false }),
      ...expectEvents(monitor.events, {
        has: [{ type: "UPGRADE", severity: "CRITICAL", step: "arm" }, { type: "INCIDENT" }],
        lacks: [{ type: "TAKEOVER" }],
      }),
      ...expectTrue(redAfter.at(-1)!, "red once funds leave"),
    ];
  }),

  scenario(PAST, "wazirx-2024", "Multisig signers approve a disguised upgrade (WazirX-style), 4-of-6", () => {
    const before = squads("wx", 4, 6, 0);
    const { monitor } = strike(before);
    return [
      ...expectPosture(before, { grade: "C", red: false }),
      ...expectEvents(monitor.events, { has: [{ type: "UPGRADE", severity: "CRITICAL" }, { type: "INCIDENT" }] }),
    ];
  }),

  scenario(PAST, "wasabi-2026", "Wasabi (2026): one upgrade key", () => {
    const before = vaultProtocol("wasabi", key("wasabi-deployer"));
    const { monitor } = strike(before);
    return [
      ...expectPosture(before, { grade: "F", red: true }),
      ...expectEvents(monitor.events, { has: [{ type: "UPGRADE", severity: "CRITICAL" }, { type: "INCIDENT" }] }),
    ];
  }),

  scenario(PAST, "zoth-2025", "Zoth-style (2025): admin key stolen, malicious upgrade", () =>
    expectPosture(vaultProtocol("zoth", key("zoth-admin")), { grade: "F", red: true }),
  ),

  scenario(PAST, "kelp-2026", "KelpDAO-style (2026): bridge verifier set of one", () =>
    expectPosture(protocol("kelp", [control("BRIDGE", multisig("dvn", 1, [key("dvn-1")], 0))]), {
      grade: "F",
      red: true,
    }),
  ),

  scenario(PAST, "resolv-2026", "Resolv-style (2026): one key can mint, then mints 900%", () => {
    const before = protocol("resolv", [control("MINT", key("minter"))]);
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1), signals: [{ type: "supply_jump", pct: 900, matchedDeposits: false }] },
    ]);
    return [
      ...expectPosture(before, { grade: "F", red: true }),
      ...expectEvents(monitor.events, { has: [{ type: "SUPPLY_JUMP", severity: "CRITICAL" }, { type: "INCIDENT" }] }),
    ];
  }),

  scenario(PAST, "humanity-2026", "Humanity-style (2026): 3-of-6; keys sit on one laptop (invisible on-chain)", () =>
    expectPosture(squads("hum", 3, 6, 0), { grade: "D", red: false }),
  ),

  scenario(
    PAST,
    "humanity-linked",
    "Same, but the three keys were created in one transaction (provably linked)",
    () => {
      const linked = [...keys("h", 3, { cluster: "one-laptop" }), ...keys("o", 3)];
      return expectPosture(vaultProtocol("hum", multisig("hum-ms", 3, linked, 0)), { grade: "F", red: true });
    },
  ),

  scenario(PAST, "kiln-2025", "SwissBorg/Kiln (2025): stake authority moved, withdrawal days later", () => {
    const before = protocol("swissborg", [control("STAKE", key("swissborg-staker"))]);
    const after = protocol("swissborg", [control("STAKE", key("kiln-attacker", { fresh: true }))]);
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1), state: after },
      { at: at(4), signals: [{ type: "outflow", share: 0.95, to: "new" }] },
    ]);
    const moved = monitor.events.find((event) => event.type === "CONTROL_MOVED");
    return [
      ...expectPosture(before, { grade: "F", red: true }),
      ...expectEvents(monitor.events, {
        has: [{ type: "CONTROL_MOVED", severity: "CRITICAL", step: "control" }, { type: "INCIDENT" }],
      }),
      ...expectTrue(!!moved && moved.at === at(1), "the authority move is flagged 3 days before the withdrawal"),
    ];
  }),

  scenario(PAST, "step-2026", "Step Finance-style (2026): treasury 2-of-3 with no delay, drained", () => {
    const treasury = multisig("step-treasury", 2, keys("st", 3), 0);
    const before = protocol("step", [control("FUNDS", treasury)]);
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1), signals: [{ type: "outflow", share: 0.3, to: "new" }] },
    ]);
    return [...expectPosture(before, { red: true }), ...expectEvents(monitor.events, { has: [{ type: "INCIDENT" }] })];
  }),

  scenario(PAST, "binance-2026", "Binance (2026): exchange signing system, nothing on-chain to grade", () =>
    expectPosture(protocol("binance", []), { grade: "unrated", red: false }),
  ),

  scenario(PAST, "ronin-2022", "Ronin (2022): 5-of-9, five keys run by one company", () => {
    const company = keys("sky", 5, { cluster: "sky-mavis" });
    const others = keys("val", 4);
    return expectPosture(protocol("ronin", [control("BRIDGE", multisig("ronin", 5, [...company, ...others], 0))]), {
      grade: "F",
      red: true,
    });
  }),

  scenario(PAST, "harmony-2022", "Harmony Horizon (2022): 2-of-5 bridge multisig", () =>
    expectPosture(protocol("harmony", [control("BRIDGE", multisig("hz", 2, keys("hz", 5), 0))]), { red: true }),
  ),

  scenario(PAST, "multichain-2023", "Multichain (2023): every key controlled by one person", () =>
    expectPosture(squads("mc", 3, 5, 0, { members: keys("mc", 5, { cluster: "ceo" }).map((who) => ({ who })) }), {
      grade: "F",
      red: true,
    }),
  ),

  scenario(PAST, "orbit-2024", "Orbit Chain (2024): 7-of-10 with no delay, seven signatures stolen", () => {
    const before = squads("orbit", 7, 10, 0);
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1), signals: [{ type: "outflow", share: 0.8, to: "bridge" }] },
    ]);
    return [
      ...expectPosture(before, { grade: "C", red: false }),
      ...expectEvents(monitor.events, { has: [{ type: "INCIDENT" }] }),
    ];
  }),

  scenario(PAST, "raydium-2022", "Raydium (2022): pool admin was one key", () =>
    expectPosture(protocol("raydium-2022", [control("FUNDS", key("pool-owner"))]), { red: true }),
  ),

  scenario(PAST, "pumpfun-2024", "Pump.fun (2024): privileged withdrawal key", () =>
    expectPosture(protocol("pump-2024", [control("FUNDS", key("withdraw-authority"))]), { red: true }),
  ),

  scenario(PAST, "infini-2025", "Infini-style (2025): removed developer keeps a way to move funds", () => {
    const limit = { users: [key("dev")], share: 0.5, destinations: "any" as const };
    const before = vaultProtocol(
      "infini",
      multisig("inf", 2, [key("a"), key("b"), key("dev")], DAY, { spendingLimits: [limit] }),
    );
    const after = vaultProtocol(
      "infini",
      multisig("inf", 2, [key("a"), key("b"), key("c")], DAY, { spendingLimits: [limit] }),
    );
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1), state: after },
    ]);
    return [
      ...expectPosture(before, { capability: { FUNDS: "F" }, red: true }),
      ...expectEvents(monitor.events, { has: [{ type: "EX_SIGNER_ON_SPENDING_LIMIT", severity: "HIGH" }] }),
    ];
  }),

  scenario(PAST, "mango-2022", "Mango (2022): collateral price pumped 1,000%, borrowed out", () => {
    const { monitor } = replay([
      { at: at(0), state: squads("mango", 5, 9, 2 * DAY) },
      { at: at(1), signals: [{ type: "oracle_divergence", pct: 1000 }] },
      { at: at(1, 0, 10), signals: [{ type: "outflow", share: 0.05, to: "new" }] },
    ]);
    return expectEvents(monitor.events, {
      has: [{ type: "ORACLE_DIVERGENCE", severity: "HIGH" }, { type: "INCIDENT" }],
    });
  }),

  scenario(PAST, "loopscale-2025", "Loopscale-style (2025): exotic collateral priced by the protocol itself", () => {
    const { monitor } = replay([
      { at: at(0), state: squads("loop", 3, 5, DAY) },
      {
        at: at(1),
        signals: [
          { type: "listing", ageDays: 20, singleKeyMint: false, protocolOracle: true, liquidityBelowCap: true },
        ],
      },
      { at: at(30), signals: [{ type: "oracle_divergence", pct: 60 }] },
      { at: at(30, 0, 5), signals: [{ type: "outflow", share: 0.15, to: "new" }] },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "LISTING", severity: "HIGH" }, { type: "INCIDENT" }] });
  }),

  scenario(PAST, "wormhole-2022", "Wormhole (2022): signature bug mints unbacked wrapped ETH", () => {
    const { monitor } = replay([
      { at: at(0), state: squads("wh", 13, 19, 0) },
      { at: at(1), signals: [{ type: "supply_jump", pct: 120_000, matchedDeposits: false }] },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "INCIDENT" }], lacks: [{ type: "TAKEOVER" }] });
  }),

  scenario(PAST, "cashio-2022", "Cashio (2022): fake collateral, infinite mint", () => {
    const { monitor } = replay([
      { at: at(0), state: protocol("cashio", [control("CODE", immutable)]) },
      { at: at(1), signals: [{ type: "supply_jump", pct: 2_000_000, matchedDeposits: false }] },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "INCIDENT" }] });
  }),

  scenario(
    PAST,
    "nomad-2022",
    "Nomad-style (2022): a properly governed upgrade ships a bug, drained weeks later",
    () => {
      const { monitor } = replay([
        { at: at(0), state: squads("nomad", 5, 9, 7 * DAY) },
        { at: at(1), signals: [{ type: "upgrade", verified: true, staged: true }] },
        { at: at(33), signals: [{ type: "outflow", share: 0.9, to: "new" }] },
      ]);
      return expectEvents(monitor.events, {
        has: [{ type: "UPGRADE", severity: "LOW" }, { type: "INCIDENT" }],
        lacks: [{ type: "TAKEOVER" }],
      });
    },
  ),
];

// ───────────────────────────── normal operations: must not cry wolf ─────────────────────────────

const NORMAL = "Normal operations (no false alarms)";

const transition = (before: Protocol, after: Protocol, signals: Tick["signals"] = []) =>
  replay([
    { at: at(0), state: before },
    { at: at(1), state: after, signals },
  ]).monitor.events;

const tenSigners = keys("k", 10);
const kaminoLike = (timelock = DAY, extra = {}) =>
  vaultProtocol("kam", multisig("kam-ms", 5, tenSigners, timelock, extra));

const normal: Scenario[] = [
  scenario(NORMAL, "routine-upgrade", "Verified, staged upgrade through a 5-of-10 with 24h", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "buffer_staged", verified: true }] },
      { at: at(2), signals: [{ type: "upgrade", verified: true, staged: true }] },
    ]);
    return [...expectEvents(monitor.events, { max: "LOW" }), ...expectTrue(!redAfter.at(-1), "not red")];
  }),

  scenario(NORMAL, "signer-rotation", "One signer replaced by a known key", () => {
    const rotated = vaultProtocol("kam", multisig("kam-ms", 5, [...tenSigners.slice(0, 9), key("k11")], DAY));
    return expectEvents(transition(kaminoLike(), rotated), { max: "LOW" });
  }),

  scenario(NORMAL, "migrate-stronger", "Move from a 3-of-5 with no delay to a new 5-of-9 with 48h", () =>
    expectEvents(transition(squads("p", 3, 5, 0), squads("p2", 5, 9, 2 * DAY)), {
      has: [{ type: "STRENGTHENED" }],
      lacks: [{ type: "WEAKENED" }],
      max: "LOW",
    }),
  ),

  scenario(NORMAL, "migrate-equal", "Move to a new multisig with the same setup", () =>
    expectEvents(transition(squads("p", 5, 10, DAY), squads("p2", 5, 10, DAY)), { max: "LOW" }),
  ),

  scenario(NORMAL, "timelock-up", "Timelock raised from 24h to 7 days", () =>
    expectEvents(transition(kaminoLike(DAY), kaminoLike(7 * DAY)), { max: "INFO" }),
  ),

  scenario(NORMAL, "threshold-up", "Threshold raised from 3-of-5 to 4-of-5 (no delay)", () =>
    expectEvents(transition(squads("p", 3, 5, 0), squads("p", 4, 5, 0)), {
      has: [{ type: "STRENGTHENED" }],
      max: "INFO",
    }),
  ),

  scenario(NORMAL, "made-immutable", "Program made immutable", () => {
    const after = protocol("p", [control("CODE", immutable)]);
    const before = protocol("p", [control("CODE", key("dev"))]);
    return [
      ...expectEvents(transition(before, after), { has: [{ type: "STRENGTHENED" }], max: "INFO" }),
      ...expectPosture(after, { grade: "A", capability: { CODE: null } }),
    ];
  }),

  scenario(NORMAL, "pause", "Guardian pauses the protocol during an incident elsewhere", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "paused" }] },
    ]);
    return [...expectEvents(monitor.events, { max: "MEDIUM" }), ...expectTrue(!redAfter.at(-1), "not red")];
  }),

  scenario(
    NORMAL,
    "hardware-nonces",
    "Signers use durable nonces for offline hardware signing, 4-of-7 with 48h",
    () => {
      const signers = keys("hw", 7).map((k, i) => ({ ...k, nonce: i < 4 }));
      const safe = vaultProtocol("hw", multisig("hw-ms", 4, signers, 2 * DAY));
      const { monitor, redAfter } = replay([
        { at: at(0), state: safe },
        { at: at(1), signals: [{ type: "nonce_created" }] },
      ]);
      return [
        ...expectPosture(safe, { grade: "A", red: false }),
        ...expectEvents(monitor.events, { max: "LOW" }),
        ...expectTrue(!redAfter.at(-1), "not red"),
      ];
    },
  ),

  scenario(NORMAL, "payroll-limit", "Spending limit of 1% a day for payroll", () => {
    const limit = { users: [key("ops")], share: 0.01, destinations: "any" as const };
    return [
      ...expectPosture(kaminoLike(DAY, { spendingLimits: [limit] }), { grade: "A", red: false }),
      ...expectEvents(transition(kaminoLike(), kaminoLike(DAY, { spendingLimits: [limit] })), { max: "INFO" }),
    ];
  }),

  scenario(NORMAL, "protocol-only-limit", "Spending limit of 20% that can only pay the protocol's own accounts", () => {
    const limit = { users: [key("keeper")], share: 0.2, destinations: "protocol" as const };
    return expectPosture(kaminoLike(DAY, { spendingLimits: [limit] }), { grade: "A", red: false });
  }),

  scenario(NORMAL, "good-listing", "Listing a mature, deep, Pyth-priced token", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike() },
      {
        at: at(1),
        signals: [
          { type: "listing", ageDays: 400, singleKeyMint: false, protocolOracle: false, liquidityBelowCap: false },
        ],
      },
    ]);
    return expectEvents(monitor.events, { max: "LOW" });
  }),

  scenario(NORMAL, "oracle-swap", "Oracle switched between two reputable providers", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "oracle_switched", to: "reputable" }] },
    ]);
    return expectEvents(monitor.events, { max: "LOW" });
  }),

  scenario(NORMAL, "small-payment", "Treasury pays 0.5% to a new vendor address", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "outflow", share: 0.005, to: "new" }] },
    ]);
    return expectEvents(monitor.events, { max: "INFO" });
  }),

  scenario(NORMAL, "announced-change", "Timelock cut from 48h to 12h, announced on-chain 48h ahead", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike(2 * DAY), signals: [{ type: "announce", hash: "cut-timelock" }] },
      { at: at(2), state: kaminoLike(12 * HOUR), hash: "cut-timelock" },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "WEAKENED", severity: "INFO" }], max: "INFO" });
  }),

  scenario(NORMAL, "late-announcement", "Same change, but announced only 1 hour ahead (does not count)", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike(2 * DAY) },
      { at: at(1, 23), signals: [{ type: "announce", hash: "cut" }] },
      { at: at(2), state: kaminoLike(12 * HOUR), hash: "cut" },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "WEAKENED", severity: "LOW" }] });
  }),

  scenario(NORMAL, "fast-team", "A coordinated team approves a cosmetic change within a minute", () => {
    const tweak = proposal({
      id: "rename",
      createdAt: at(1),
      threshold: 5,
      approvals: Array.from({ length: 5 }, (_, i) => ({ at: at(1, 0, 0, 10 + i) })),
      touches: [],
      after: kaminoLike(),
    });
    const { monitor } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1, 0, 1), proposals: [tweak] },
    ]);
    return expectEvents(monitor.events, {
      has: [{ type: "PRESIGNED_APPROVALS", severity: "MEDIUM" }],
      lacks: [{ type: "TAKEOVER" }, { type: "TAKEOVER_SETUP" }],
    });
  }),

  scenario(NORMAL, "nested", "3-of-5 with 24h whose members are 2-of-3 team multisigs", () => {
    const teams = Array.from({ length: 5 }, (_, i) => multisig(`team${i}`, 2, keys(`t${i}-`, 3), 0));
    return expectPosture(vaultProtocol("nested", multisig("outer", 3, teams, DAY)), { grade: "A", red: false });
  }),

  scenario(NORMAL, "immutable-plus-admin", "Immutable code, risk settings by a 5-of-9 with 48h", () =>
    expectPosture(
      protocol("imm", [control("CODE", immutable), control("RISK", multisig("risk", 5, keys("r", 9), 2 * DAY))]),
      { grade: "A", capability: { CODE: null, RISK: "A" } },
    ),
  ),

  scenario(NORMAL, "usdc", "USDC collateral: Circle can mint and freeze (a stated trust assumption)", () =>
    expectPosture(
      protocol("lend", [
        ...kaminoLike().controls,
        control("MINT", key("circle"), { trusted: "regulated stablecoin issuer" }),
        control("FREEZE", key("circle-freeze"), { trusted: "regulated stablecoin issuer" }),
      ]),
      { grade: "A", red: false, reason: "trust assumption" },
    ),
  ),

  scenario(NORMAL, "one-hot-signer", "5-of-10 with 24h where one signer is a hot wallet", () => {
    const signers = keys("hs", 10).map((k, i) => ({ ...k, exposed: i === 0 }));
    return expectPosture(vaultProtocol("hs", multisig("hs-ms", 5, signers, DAY)), { grade: "A" });
  }),

  scenario(NORMAL, "weaken-then-upgrade", "Delay cut 48h → 12h (A to B), then a routine upgrade 2 days later", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike(2 * DAY) },
      { at: at(1), state: kaminoLike(12 * HOUR) },
      { at: at(3), signals: [{ type: "upgrade", verified: true, staged: true }] },
    ]);
    return [
      ...expectEvents(monitor.events, { lacks: [{ type: "TAKEOVER" }], max: "LOW" }),
      ...expectTrue(!redAfter.at(-1), "not red"),
    ];
  }),

  scenario(
    NORMAL,
    "announced-sequence",
    "3-of-5 removes its delay, then ships an upgrade; both announced 2 days ahead",
    () => {
      const { monitor } = replay([
        {
          at: at(0),
          state: squads("as", 3, 5, 2 * DAY),
          signals: [
            { type: "announce", hash: "remove-delay" },
            { type: "announce", hash: "ship-v2" },
          ],
        },
        { at: at(2), state: squads("as", 3, 5, 0), hash: "remove-delay" },
        { at: at(3), signals: [{ type: "upgrade", verified: true, staged: true }], hash: "ship-v2" },
      ]);
      return expectEvents(monitor.events, { has: [{ type: "WEAKENED" }], lacks: [{ type: "TAKEOVER" }] });
    },
  ),

  scenario(
    NORMAL,
    "unannounced-sequence",
    "Same two changes with no announcement: this is the takeover pattern",
    () => {
      const { monitor } = replay([
        { at: at(0), state: squads("as", 3, 5, 2 * DAY) },
        { at: at(2), state: squads("as", 3, 5, 0) },
        { at: at(3), signals: [{ type: "upgrade", verified: true, staged: true }] },
      ]);
      return expectEvents(monitor.events, { has: [{ type: "TAKEOVER" }] });
    },
  ),

  scenario(NORMAL, "lst-exit-window", "LST with 24h delay but users need 3 days to unstake", () =>
    expectPosture(vaultProtocol("lst", multisig("lst-ms", 5, keys("l", 10), DAY), { exitLatency: 3 * DAY }), {
      grade: "C",
      red: false,
    }),
  ),
];

// ───────────────────────────── attacker tricks ─────────────────────────────

const TRICKS = "Attacker tricks";

const tricks: Scenario[] = [
  scenario(TRICKS, "foreign-nonce", "Pre-signing with nonce accounts owned by the attacker's own key", () => {
    const before = squads("fn", 3, 5, 0);
    const steal = proposal({
      id: "steal",
      createdAt: at(1),
      threshold: 3,
      approvals: [1, 2, 3].map(() => ({ at: at(1, 0, 0, 2), durableNonce: true })),
      approvedAt: at(1, 0, 0, 2),
      touches: ["CODE"],
      after: vaultProtocol("fn", key("thief", { fresh: true })),
    });
    const { monitor } = replay([
      { at: at(0), state: before },
      { at: at(1, 0, 0, 3), proposals: [steal] },
    ]);
    return [
      ...expectPosture(before, { red: false }),
      ...expectEvents(monitor.events, {
        has: [{ type: "PRESIGNED_APPROVALS", severity: "CRITICAL", step: "control" }],
      }),
    ];
  }),

  scenario(TRICKS, "ratchet", "Delay cut in small steps: 7d → 3d → 23h → 12h → none", () => {
    const steps = [7 * DAY, 3 * DAY, 23 * HOUR, 12 * HOUR, 0];
    const { monitor } = replay(steps.map((timelock, i) => ({ at: at(i * 10), state: kaminoLike(timelock) })));
    return expectEvents(monitor.events, { has: [{ type: "RATCHET", severity: "HIGH" }] });
  }),

  scenario(
    TRICKS,
    "flash-change",
    "Weakened, upgraded and restored between two polls (seen in the transaction stream)",
    () => {
      const strong = vaultProtocol("fl", multisig("fl-ms", 4, keys("f", 7), 2 * DAY));
      const weak = vaultProtocol("fl", multisig("fl-ms", 1, keys("f", 7), 0));
      const { monitor, redAfter } = replay([
        { at: at(0), state: strong },
        { at: at(1), state: weak },
        { at: at(1, 0, 0, 5), signals: [{ type: "upgrade", verified: false, staged: false }] },
        { at: at(1, 0, 0, 9), state: strong },
      ]);
      return [
        ...expectEvents(monitor.events, { has: [{ type: "WEAKENED", severity: "CRITICAL" }, { type: "TAKEOVER" }] }),
        ...expectTrue(redAfter.at(-1)!, "stays red after the settings are restored"),
      ];
    },
  ),

  scenario(
    TRICKS,
    "flash-change-snapshot-only",
    "Same attack seen only by snapshots: why the transaction stream is required",
    () => {
      const strong = vaultProtocol("fl", multisig("fl-ms", 4, keys("f", 7), 2 * DAY));
      const { monitor } = replay([
        { at: at(0), state: strong },
        { at: at(1, 0, 0, 10), state: strong },
      ]);
      return expectEvents(monitor.events, { lacks: [{ type: "WEAKENED" }] });
    },
  ),

  scenario(TRICKS, "migrate-weaker", "Control moved to a brand-new 2-of-3 with no delay", () =>
    expectEvents(transition(squads("p", 5, 10, DAY), squads("p2", 2, 3, 0)), {
      has: [{ type: "WEAKENED", severity: "CRITICAL", step: "control" }],
    }),
  ),

  scenario(TRICKS, "hide-behind-pda", "Strong multisig hands control to a program we cannot decode", () => {
    const hidden = protocol("p", [control("CODE", unknown("mystery-pda")), control("FUNDS", unknown("mystery-pda"))]);
    return expectEvents(transition(squads("p", 5, 10, DAY), hidden), {
      has: [{ type: "CONTROL_MOVED", min: "HIGH" }],
      lacks: [{ type: "STRENGTHENED" }],
    });
  }),

  scenario(
    TRICKS,
    "hide-weak-behind-pda",
    "Weak 3-of-4 hands control to a program we cannot decode (must not look like an upgrade)",
    () => {
      const hidden = protocol("p", [control("CODE", unknown("mystery-pda")), control("FUNDS", unknown("mystery-pda"))]);
      return expectEvents(transition(squads("p", 3, 4, 0), hidden), {
        has: [{ type: "CONTROL_MOVED", min: "HIGH" }],
        lacks: [{ type: "STRENGTHENED" }],
      });
    },
  ),

  scenario(TRICKS, "spending-limit", "Spending limit for 30% with any destination slipped into a config change", () => {
    const limit = { users: [key("k1")], share: 0.3, destinations: "any" as const };
    const after = kaminoLike(DAY, { spendingLimits: [limit] });
    return [
      ...expectPosture(after, { capability: { FUNDS: "F", CODE: "A" }, red: true }),
      ...expectEvents(transition(kaminoLike(), after), {
        has: [{ type: "WEAKENED", severity: "CRITICAL", capability: "FUNDS" }],
      }),
    ];
  }),

  scenario(TRICKS, "config-authority-key", "A single key made the multisig's config authority", () => {
    const after = kaminoLike(DAY, { configAuthority: key("ca") });
    return [
      ...expectPosture(after, { grade: "F", red: true }),
      ...expectEvents(transition(kaminoLike(), after), { has: [{ type: "WEAKENED", severity: "CRITICAL" }] }),
    ];
  }),

  scenario(TRICKS, "config-authority-1of2", "Config authority is a '1-of-2 multisig' (one key in disguise)", () =>
    expectPosture(kaminoLike(DAY, { configAuthority: multisig("ca", 1, keys("ca", 2), 0) }), {
      grade: "F",
      red: true,
    }),
  ),

  scenario(
    TRICKS,
    "same-key-everywhere",
    "4-of-7 with 48h, but four 'members' are multisigs holding the same key",
    () => {
      const fronts = Array.from({ length: 4 }, (_, i) => multisig(`front${i}`, 1, [key("x")], 0));
      const outer = multisig("outer", 4, [...fronts, ...keys("real", 3)], 2 * DAY);
      return expectPosture(vaultProtocol("sk", outer), { grade: "D" });
    },
  ),

  scenario(TRICKS, "diamond", "2-of-2 over two 2-of-3 multisigs that share two signers", () => {
    const left = multisig("left", 2, [key("a"), key("b"), key("c")], 0);
    const right = multisig("right", 2, [key("a"), key("b"), key("d")], 0);
    return expectPosture(vaultProtocol("dm", multisig("top", 2, [left, right], 0)), { grade: "F", red: true });
  }),

  scenario(TRICKS, "fresh-signers", "Three never-seen signers added, then the delay removed the next day", () => {
    const base = keys("k", 10);
    const fresh = keys("new", 3, { fresh: true });
    const { monitor } = replay([
      { at: at(0), state: vaultProtocol("fs", multisig("fs-ms", 5, base, DAY)) },
      { at: at(1), state: vaultProtocol("fs", multisig("fs-ms", 5, [...base, ...fresh], DAY)) },
      { at: at(2), state: vaultProtocol("fs", multisig("fs-ms", 3, [...base, ...fresh], 0)) },
    ]);
    return expectEvents(monitor.events, {
      has: [
        { type: "FRESH_SIGNERS_ADDED", step: "prepare" },
        { type: "WEAKENED", min: "HIGH" },
        { type: "TAKEOVER_SETUP" },
      ],
    });
  }),

  scenario(
    TRICKS,
    "approved-survives-rotation",
    "Approved malicious vault transaction; the team rotates signers instead of cancelling",
    () => {
      const before = squads("rot", 3, 5, DAY);
      const bad = proposal({
        id: "bad",
        createdAt: at(1),
        threshold: 3,
        approvals: [1, 2, 3].map((h) => ({ at: at(1, h) })),
        approvedAt: at(1, 3),
        timelock: DAY,
        after: vaultProtocol("rot", key("thief", { fresh: true })),
      });
      const { monitor, redAfter } = replay([
        { at: at(0), state: before },
        { at: at(1, 4), proposals: [bad] },
        { at: at(1, 6), proposals: [{ ...bad, stale: true }] },
        { at: at(1, 8), proposals: [{ ...bad, stale: true, cancelled: true }] },
      ]);
      return [
        ...expectEvents(monitor.events, { has: [{ type: "APPROVED_DANGEROUS", severity: "CRITICAL" }] }),
        ...expectTrue(redAfter[1]!, "red once approved"),
        ...expectTrue(redAfter[2]!, "still red after rotation: a stale vault transaction can still execute"),
        ...expectTrue(!redAfter[3], "clears once cancelled"),
      ];
    },
  ),

  scenario(TRICKS, "stale-config", "Approved malicious config change made stale by a rotation", () => {
    const bad = proposal({
      id: "bad-config",
      kind: "config",
      createdAt: at(1),
      approvedAt: at(1, 3),
      timelock: DAY,
      after: squads("sc", 1, 5, 0),
    });
    const { redAfter } = replay([
      { at: at(0), state: squads("sc", 3, 5, DAY) },
      { at: at(1, 4), proposals: [bad] },
      { at: at(1, 6), proposals: [{ ...bad, stale: true }] },
    ]);
    return [
      ...expectTrue(redAfter[1]!, "red once approved"),
      ...expectTrue(!redAfter[2], "clears: a stale config transaction cannot execute"),
    ];
  }),

  scenario(TRICKS, "unverified-buffer", "Unverified code staged for an upgrade", () => {
    const { monitor } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "buffer_staged", verified: false }] },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "UPGRADE_STAGED", severity: "MEDIUM", step: "prepare" }] });
  }),

  scenario(TRICKS, "sybil-signers", "3-of-5 with no delay whose five keys were all created in one transaction", () =>
    expectPosture(vaultProtocol("sy", multisig("sy-ms", 3, keys("sy", 5, { cluster: "one-tx" }), 0)), {
      grade: "F",
      red: true,
    }),
  ),

  scenario(
    TRICKS,
    "sybil-signers-delay",
    "Same one-party 3-of-5, but with a 24h delay: one key, users still get a day",
    () =>
      expectPosture(vaultProtocol("sy", multisig("sy-ms", 3, keys("sy", 5, { cluster: "one-tx" }), DAY)), {
        grade: "D",
        red: false,
      }),
  ),

  scenario(
    TRICKS,
    "corporate-funder",
    "All signers funded from the company treasury (normal, not proof of one holder)",
    () => expectPosture(squads("corp", 3, 5, DAY), { grade: "B", red: false }),
  ),

  scenario(TRICKS, "hot-signers", "4-of-7 with 48h, the four cheapest signers are hot wallets", () => {
    const signers = keys("hot", 7).map((k, i) => ({ ...k, exposed: i < 4 }));
    return expectPosture(vaultProtocol("hot", multisig("hot-ms", 4, signers, 2 * DAY)), {
      grade: "B",
      reason: "hot wallets",
    });
  }),

  scenario(
    TRICKS,
    "hot-signers-never-red",
    "3-of-5 with no delay and three hot signers: worse, but heuristics never make red",
    () => {
      const signers = keys("hot", 5).map((k, i) => ({ ...k, exposed: i < 3 }));
      return expectPosture(vaultProtocol("hot", multisig("hot-ms", 3, signers, 0)), { grade: "D", red: false });
    },
  ),

  scenario(TRICKS, "info-flood", "10,000 low alerts sent to bury one critical alert", () => {
    const noise: Event[] = Array.from({ length: 10_000 }, (_, i) => ({
      type: "NOISE",
      severity: "INFO",
      at: T0 + i,
      detail: "",
    }));
    const critical: Event = { type: "TAKEOVER", severity: "CRITICAL", at: T0 + 5_000, detail: "" };
    const sent = deliver([...noise, critical], 50);
    return expectTrue(sent[0] === critical && sent.length === 50, "critical first and nothing over budget");
  }),
];

// ───────────────────────────── governance ─────────────────────────────

const GOV = "DAO governance";

const spread = (count: number) =>
  keys("h", count).map((holder) => [holder, 1 / count] as [ReturnType<typeof key>, number]);

const govProposal = (id: string, extra: Parameters<typeof proposal>[0] extends infer P ? Partial<P> : never) =>
  proposal({
    id,
    kind: "dao",
    createdAt: at(1),
    after: protocol("dao", []),
    touches: ["FUNDS"],
    votingTime: 3 * DAY,
    holdUp: DAY,
    ...extra,
  });

const govEvents = (
  p: ReturnType<typeof proposal>,
  state = protocol("dao", [control("FUNDS", dao("realm", spread(10)))]),
) =>
  replay([
    { at: at(0), state },
    { at: at(1), proposals: [p] },
  ]).monitor.events;

const governance: Scenario[] = [
  scenario(GOV, "healthy-dao", "10 equal holders, 67% to pass, 7-day vote, 1-day hold-up", () =>
    expectPosture(
      protocol("dao", [control("FUNDS", dao("realm", spread(10), { passShare: 0.67, votingTime: 7 * DAY }))]),
      { grade: "A", red: false },
    ),
  ),

  scenario(GOV, "beanstalk-2022", "Beanstalk-style (2022): flash-borrowed votes pass an emergency proposal", () =>
    expectEvents(
      govEvents(govProposal("bip-18", { depositShareBefore: 1, topHolderShare: 1.2, tipping: "early", holdUp: 0 })),
      { has: [{ type: "DAO_PROPOSAL_RISK", severity: "CRITICAL" }] },
    ),
  ),

  scenario(GOV, "solend-2022", "Solend SLND1-style (2022): one whale can pass a vote over user funds in 6 hours", () =>
    expectEvents(govEvents(govProposal("slnd1", { topHolderShare: 1, votingTime: 6 * HOUR, holdUp: 0 })), {
      has: [{ type: "DAO_PROPOSAL_RISK", severity: "CRITICAL" }],
    }),
  ),

  scenario(GOV, "synthetify-2023", "Synthetify-style (2023): sleepy DAO, attacker can pass alone", () => {
    const sleepy = dao("syn", [
      [key("attacker"), 0.6],
      ...spread(4).map(([h]) => [h, 0.1] as [ReturnType<typeof key>, number]),
    ]);
    const state = protocol("syn", [control("FUNDS", sleepy)]);
    const drain = govProposal("drain", {
      topHolderShare: 1.2,
      after: protocol("syn", [control("FUNDS", key("attacker"))]),
    });
    return [
      ...expectPosture(state, { grade: "D", red: false }),
      ...expectEvents(govEvents(drain, state), {
        has: [
          { type: "DAO_PROPOSAL_RISK", severity: "CRITICAL" },
          { type: "SCHEDULED_WEAKENING", severity: "CRITICAL" },
        ],
      }),
    ];
  }),

  scenario(
    GOV,
    "tornado-2023",
    "Tornado-style (2023): proposal title says one thing, its code hands over control",
    () =>
      expectEvents(
        govEvents(
          govProposal("tc-20", { touches: ["CODE"], after: protocol("dao", [control("CODE", key("attacker"))]) }),
        ),
        {
          has: [
            { type: "DAO_PROPOSAL_RISK", min: "HIGH" },
            { type: "SCHEDULED_WEAKENING", severity: "CRITICAL" },
          ],
        },
      ),
  ),

  scenario(GOV, "compound-289", "Compound 289-style (2024): a coordinated group can pass a treasury move", () =>
    expectEvents(govEvents(govProposal("289", { topHolderShare: 1.05 })), {
      has: [{ type: "DAO_PROPOSAL_RISK", severity: "CRITICAL" }],
    }),
  ),

  scenario(GOV, "build-finance", "Build Finance-style (2022): tokens bought up, then a vote to take the mint", () =>
    expectEvents(govEvents(govProposal("mint-grab", { depositShareBefore: 0.9, touches: ["MINT"] })), {
      has: [{ type: "DAO_PROPOSAL_RISK", severity: "CRITICAL" }],
    }),
  ),

  scenario(GOV, "plugin-key-instant", "Vote plugin upgradeable by one key; votes tip early with no hold-up", () =>
    expectPosture(
      protocol("pl", [
        control(
          "FUNDS",
          dao("pl", spread(10), { pluginUpgradeAuthority: key("plugin-dev"), tipping: "early", holdUp: 0 }),
        ),
      ]),
      { grade: "F", red: true },
    ),
  ),

  scenario(GOV, "plugin-key-slow", "Same plugin key, but a 3-day vote and 1-day hold-up", () =>
    expectPosture(
      protocol("pl", [control("FUNDS", dao("pl", spread(10), { pluginUpgradeAuthority: key("plugin-dev") }))]),
      {
        grade: "D",
        red: false,
      },
    ),
  ),

  scenario(GOV, "realm-authority", "Realm authority is one key; early tipping, no hold-up", () =>
    expectPosture(
      protocol("ra", [
        control("CODE", dao("ra", spread(10), { realmAuthority: key("founder"), tipping: "early", holdUp: 0 })),
      ]),
      { red: true },
    ),
  ),

  scenario(GOV, "council-mint", "Council mint authority is one key (5-day vote, no hold-up)", () =>
    expectPosture(
      protocol("cm", [
        control("CODE", dao("cm", spread(10), { councilMintAuthority: key("minter"), votingTime: 5 * DAY, holdUp: 0 })),
      ]),
      { grade: "D" },
    ),
  ),

  scenario(GOV, "veto-council", "One holder can pass, but a 3-day vote and an independent veto council", () =>
    expectPosture(
      protocol("vt", [
        control(
          "FUNDS",
          dao(
            "vt",
            [
              [key("whale"), 0.6],
              [key("b"), 0.4],
            ],
            { veto: true },
          ),
        ),
      ]),
      {
        grade: "C",
      },
    ),
  ),
];

// ───────────────────────────── dependencies and token powers ─────────────────────────────

const DEPS = "Dependencies and token powers";

const lending = (...extra: ReturnType<typeof control>[]) => protocol("lend", [...kaminoLike().controls, ...extra]);

const dependencies: Scenario[] = [
  scenario(DEPS, "collateral-mint-key", "Accepted collateral whose mint authority is one key", () =>
    expectPosture(lending(control("MINT", key("issuer"))), { red: true }),
  ),
  scenario(DEPS, "oracle-feed-key", "A market's price feed can be reconfigured by one key", () =>
    expectPosture(lending(control("PRICE", key("feed-admin"))), { red: true }),
  ),
  scenario(DEPS, "own-oracle-program", "Protocol-run oracle program upgradeable by a 2-of-3, no delay", () =>
    expectPosture(lending(control("PRICE", multisig("oracle-ms", 2, keys("o", 3), 0))), { red: true }),
  ),
  scenario(DEPS, "permanent-delegate", "Collateral with a permanent delegate held by one key", () =>
    expectPosture(lending(control("FUNDS", key("delegate"))), { red: true }),
  ),
  scenario(DEPS, "transfer-hook", "Collateral transfer hook upgradeable by one key (can block, not steal)", () =>
    expectPosture(lending(control("FREEZE", key("hook-dev"))), { grade: "D", red: false }),
  ),
  scenario(DEPS, "bridge-weakened", "Bridge verifiers cut from 2-of-2 to 1-of-1", () => {
    const before = protocol("br", [control("BRIDGE", multisig("dvn", 2, keys("v", 2), 0))]);
    const after = protocol("br", [control("BRIDGE", multisig("dvn", 1, keys("v", 1), 0))]);
    return [
      ...expectPosture(after, { red: true }),
      ...expectEvents(transition(before, after), { has: [{ type: "WEAKENED", min: "HIGH" }] }),
    ];
  }),
  scenario(DEPS, "unverified-code", "Strong 5-of-10 with 7 days, but the deployed code matches no public build", () =>
    expectPosture(protocol("uv", [control("CODE", multisig("uv", 5, keys("u", 10), 7 * DAY), { unverified: true })]), {
      grade: "B",
      reason: "verified build",
    }),
  ),
  scenario(DEPS, "issuer-freeze", "A stablecoin issuer freezes funds the protocol holds", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "issuer_freeze" }] },
    ]);
    return [
      ...expectEvents(monitor.events, { has: [{ type: "ISSUER_FREEZE", severity: "HIGH" }] }),
      ...expectTrue(!redAfter.at(-1), "not red"),
    ];
  }),
];

// ───────────────────────────── broken or strange data ─────────────────────────────

const DATA = "Broken or strange data";

const data: Scenario[] = [
  scenario(DATA, "cycle", "Two multisigs that are each other's members", () => {
    const a = multisig("ma", 2, [], 0);
    const b = multisig("mb", 2, [a, key("k2")], 0);
    a.members = [{ who: b }, { who: key("k1") }];
    return expectPosture(vaultProtocol("cy", a), { provisional: true, grade: "C" });
  }),
  scenario(DATA, "threshold-zero", "Multisig reports threshold 0 (corrupt data)", () =>
    expectPosture(squads("tz", 0, 5, DAY), { provisional: true, grade: "C" }),
  ),
  scenario(DATA, "bricked", "Threshold higher than the number of voters, no other route (nobody can act)", () =>
    expectPosture(squads("br", 3, 2, 0), { grade: "A", capability: { CODE: null } }),
  ),
  scenario(DATA, "bricked-with-backdoor", "Bricked vote, but a config authority still works", () =>
    expectPosture(squads("bb", 3, 2, 0, { configAuthority: key("ca") }), { red: true }),
  ),
  scenario(DATA, "non-voters", "2-of-5 where three members can only propose, not vote", () => {
    const members = keys("nv", 5).map((who, i) => ({ who, vote: i < 2 }));
    const ms = { ...multisig("nv", 2, [], 0), members };
    return expectPosture(vaultProtocol("nv", ms), { red: true });
  }),
  scenario(DATA, "huge-timelock", "Timelock of 100 years", () =>
    expectPosture(squads("ht", 3, 5, 36_500 * DAY), { grade: "A" }),
  ),
  scenario(DATA, "duplicate-members", "Same key listed twice in a 2-of-3 (treated as the worst case)", () =>
    expectPosture(vaultProtocol("dup", multisig("dup", 2, [key("a"), key("a"), key("b")], 0)), { red: true }),
  ),
  scenario(DATA, "empty", "Protocol with nothing mapped yet", () =>
    expectPosture(protocol("e", []), { grade: "unrated" }),
  ),
];

// ───────────────────────────── the monitor itself ─────────────────────────────

const OPS = "Monitor integrity";

const ops: Scenario[] = [
  scenario(OPS, "rpc-majority", "Three providers, one lies: cannot fake red, cannot hide red", () => [
    ...expectTrue(!redPublishable([true, false, false]), "a lone liar cannot fake red"),
    ...expectTrue(redPublishable([true, true, false]), "a lone liar cannot hide red"),
  ]),
  scenario(OPS, "rpc-two-providers", "Only two providers: one liar can block red (needs a third)", () =>
    expectTrue(!redPublishable([true, false]), "documented limit: two providers can be blocked"),
  ),
  scenario(OPS, "rpc-one-provider", "Only one provider: red is never published on one reading", () =>
    expectTrue(!redPublishable([true]), "one reading is not enough"),
  ),
  scenario(OPS, "glitch", "One bad snapshot does not move the grade; two in a row do", () => [
    ...expectTrue(smoothGrades(["A", "F", "A"]).join("") === "AAA", "a one-off glitch is ignored"),
    ...expectTrue(smoothGrades(["A", "C", "C"]).join("") === "AAC", "a real change lands on the second snapshot"),
  ]),
  scenario(OPS, "silent", "Indexer quiet for 6 minutes raises the heartbeat alert", () => [
    ...expectTrue(monitorSilent(T0, T0 + 6 * 60), "6 minutes is too quiet"),
    ...expectTrue(!monitorSilent(T0, T0 + 4 * 60), "4 minutes is fine"),
  ]),
  scenario(OPS, "replay", "The same transaction replayed after downtime raises one alert", () => {
    const tick: Tick = { at: at(1), signals: [{ type: "outflow", share: 0.5, to: "new" }], txSig: "sig-1" };
    const { monitor } = replay([{ at: at(0), state: kaminoLike() }, tick, tick]);
    return expectTrue(monitor.events.filter((e) => e.type === "OUTFLOW").length === 1, "one OUTFLOW, not two");
  }),
  scenario(OPS, "late-replay", "Events replayed late still use their block time for the takeover windows", () => {
    const { monitor } = replay([
      { at: at(0), state: squads("lr", 5, 10, DAY) },
      { at: at(1), state: squads("lr", 2, 10, 0) },
      { at: at(1, 1), signals: [{ type: "upgrade", verified: false, staged: false }] },
    ]);
    return expectEvents(monitor.events, { has: [{ type: "TAKEOVER" }] });
  }),
  scenario(OPS, "cool-off", "Takeover red clears 7 days after the last step once settings are strong again", () => {
    const { redAfter } = replay([
      { at: at(0), state: squads("co", 5, 10, DAY) },
      { at: at(1), state: squads("co", 2, 10, 0) },
      { at: at(1, 1), signals: [{ type: "upgrade", verified: false, staged: false }] },
      { at: at(2), state: squads("co", 5, 10, DAY) },
      { at: at(5), state: squads("co", 5, 10, DAY) },
      { at: at(9), state: squads("co", 5, 10, DAY) },
    ]);
    return [
      ...expectTrue(redAfter[4]!, "still red 4 days after the attack"),
      ...expectTrue(!redAfter[5], "cleared after 7 quiet days"),
    ];
  }),
];

// ───────────────────────────── market stress, rescues and scale ─────────────────────────────

const WORLD = "Market stress, rescues and scale";

const timed = (work: () => string[], budgetMs: number): string[] => {
  const started = Date.now();
  const failures = work();
  const took = Date.now() - started;
  return [...failures, ...expectTrue(took <= budgetMs, `took ${took}ms (budget ${budgetMs}ms)`)];
};

const world: Scenario[] = [
  scenario(WORLD, "bank-run", "Market panic: 30% withdrawn in an hour by thousands of depositors", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike() },
      { at: at(1), signals: [{ type: "outflow", share: 0.3, to: "new", manyRecipients: true }] },
    ]);
    return [
      ...expectEvents(monitor.events, { lacks: [{ type: "INCIDENT" }], max: "INFO" }),
      ...expectTrue(!redAfter.at(-1), "not red"),
    ];
  }),

  scenario(WORLD, "cold-storage-announced", "Treasury moves 30% to a new cold wallet, announced 2 days ahead", () => {
    const { monitor, redAfter } = replay([
      { at: at(0), state: kaminoLike(), signals: [{ type: "announce", hash: "to-cold" }] },
      { at: at(2), signals: [{ type: "outflow", share: 0.3, to: "new" }], hash: "to-cold" },
    ]);
    return [
      ...expectEvents(monitor.events, { has: [{ type: "OUTFLOW", severity: "LOW" }], lacks: [{ type: "INCIDENT" }] }),
      ...expectTrue(!redAfter.at(-1), "not red"),
    ];
  }),

  scenario(
    WORLD,
    "cold-storage-unannounced",
    "Same move with no announcement: treated as a theft until explained",
    () => {
      const { monitor } = replay([
        { at: at(0), state: kaminoLike() },
        { at: at(2), signals: [{ type: "outflow", share: 0.3, to: "new" }] },
      ]);
      return expectEvents(monitor.events, { has: [{ type: "INCIDENT" }] });
    },
  ),

  scenario(
    WORLD,
    "emergency-patch",
    "Known trade-off: during a live exploit the team drops its delay and patches (looks like a takeover)",
    () => {
      const { monitor } = replay([
        { at: at(0), state: squads("em", 3, 5, DAY) },
        { at: at(1), signals: [{ type: "outflow", share: 0.2, to: "new" }] },
        { at: at(1, 0, 20), state: squads("em", 3, 5, 0) },
        { at: at(1, 0, 40), signals: [{ type: "upgrade", verified: false, staged: false }] },
      ]);
      return expectEvents(monitor.events, { has: [{ type: "INCIDENT" }, { type: "TAKEOVER" }] });
    },
  ),

  scenario(WORLD, "routine-grant", "Healthy DAO pays a 1% grant", () => {
    const grant = govProposal("grant-42", { treasuryShare: 0.01 });
    return expectEvents(govEvents(grant), {
      has: [{ type: "DAO_PROPOSAL_RISK", severity: "LOW" }],
      lacks: [{ type: "TAKEOVER_SETUP" }],
      max: "LOW",
    });
  }),

  scenario(
    WORLD,
    "whale-small-grant",
    "A whale who can pass anything proposes a 1% grant (watch it, but not critical)",
    () =>
      expectEvents(govEvents(govProposal("grant-43", { treasuryShare: 0.01, topHolderShare: 1.4 })), {
        has: [{ type: "DAO_PROPOSAL_RISK", severity: "HIGH" }],
      }),
  ),

  scenario(WORLD, "shared-oracle", "One oracle authority used by two protocols is cut from 3-of-5 to 1-of-5", () => {
    const strong = multisig("shared-oracle", 3, keys("or", 5), 2 * DAY);
    const weak = multisig("shared-oracle", 1, keys("or", 5), 0);
    const first = (by: typeof strong) => protocol("lend-a", [...kaminoLike().controls, control("PRICE", by)]);
    const second = (by: typeof strong) =>
      protocol("perps-b", [...squads("pb", 4, 7, 2 * DAY).controls, control("PRICE", by)]);
    return [
      ...expectEvents(transition(first(strong), first(weak)), {
        has: [{ type: "WEAKENED", severity: "CRITICAL", capability: "PRICE" }],
      }),
      ...expectEvents(transition(second(strong), second(weak)), {
        has: [{ type: "WEAKENED", severity: "CRITICAL", capability: "PRICE" }],
      }),
    ];
  }),

  scenario(WORLD, "big-multisig", "Security council of 30 signers, 15 needed, 48h (must finish quickly)", () =>
    timed(() => expectPosture(squads("big", 15, 30, 2 * DAY), { grade: "A" }), 2_000),
  ),

  scenario(WORLD, "big-multisig-linked", "30 signers, 15 needed, no delay, but 12 of them are one party", () => {
    const members = [...keys("one", 12, { cluster: "party" }), ...keys("ind", 18)];
    return timed(() => expectPosture(vaultProtocol("bl", multisig("bl", 15, members, 0)), { grade: "C" }), 2_000);
  }),

  scenario(WORLD, "big-dao", "DAO with 1,000 holders: one whale with 30%, 50% needed", () => {
    const small = keys("holder", 999).map((holder) => [holder, 0.7 / 999] as [ReturnType<typeof key>, number]);
    const big = dao("big", [[key("whale"), 0.3], ...small]);
    return timed(
      () => expectPosture(protocol("big", [control("FUNDS", big)]), { grade: "A", capability: { FUNDS: "A" } }),
      2_000,
    );
  }),
];

export const SCENARIOS: Scenario[] = [
  ...live,
  ...past,
  ...normal,
  ...tricks,
  ...governance,
  ...dependencies,
  ...data,
  ...ops,
  ...world,
];
