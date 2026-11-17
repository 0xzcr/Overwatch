/**
 * Exhaustive and randomized checks.
 *
 * 1. Sweep: every combination of multisig settings in a bounded space (signers, threshold, timelock, config authority,
 *    spending limit, nonce holders, hot wallets, linked keys, exit time), checked against rules that must always hold.
 * 2. Oracle: thousands of random control trees (nested multisigs, DAOs, shared signers, bypasses), where the engine's
 *    "keys to steal / delay" answer is compared with a brute force over every subset of keys.
 */
import type { Authority, Capability, Dao, ExitLatency, Grade, Key, Multisig, Protocol } from "./model";
import { DAY, GRADES, HOUR } from "./model";
import { diff, gradeGap, isDrain, MATERIAL_SHARE, pathsFor, postureOf, severityFor } from "./engine";
import { control, key, multisig, protocol } from "./harness";

// ───────────────────────────── 1. the sweep ─────────────────────────────

const TIMELOCKS = [0, HOUR, 23 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
const CONFIG_AUTHORITIES = ["none", "key", "1of2", "3of5-instant"] as const;
const LIMITS = ["none", "small", "open", "protocol-only"] as const;

interface Config {
  n: number;
  k: number;
  timelock: number;
  ca: (typeof CONFIG_AUTHORITIES)[number];
  limit: (typeof LIMITS)[number];
  /** signers 1..nonceCount hold durable nonce accounts */
  nonceCount: number;
  /** signers 1..exposedCount are hot wallets */
  exposedCount: number;
  /** every signer provably held by one party */
  linked: boolean;
  exitLatency: ExitLatency;
}

function signer(index: number, c: Config): Key {
  return key(`s${index}`, {
    nonce: index <= c.nonceCount,
    exposed: index <= c.exposedCount,
    cluster: c.linked ? "one-party" : undefined,
  });
}

function configAuthority(c: Config): Authority | null {
  if (c.ca === "key") return key("ca");
  if (c.ca === "1of2") return multisig("ca-ms", 1, [key("ca1"), key("ca2")], 0);
  if (c.ca === "3of5-instant")
    return multisig(
      "ca-ms",
      3,
      ["c1", "c2", "c3", "c4", "c5"].map((id) => key(id)),
      0,
    );
  return null;
}

function spendingLimits(c: Config) {
  const user = [key("s1", { cluster: c.linked ? "one-party" : undefined })];
  if (c.limit === "small") return [{ users: user, share: MATERIAL_SHARE / 5, destinations: "any" as const }];
  if (c.limit === "open") return [{ users: user, share: 0.3, destinations: "any" as const }];
  if (c.limit === "protocol-only") return [{ users: user, share: 0.3, destinations: "protocol" as const }];
  return [];
}

function build(c: Config, reverse = false): Protocol {
  const signers = Array.from({ length: c.n }, (_, i) => signer(i + 1, c));
  const ordered = reverse ? [...signers].reverse() : signers;
  const ms = multisig("ms", c.k, ordered, c.timelock, {
    configAuthority: configAuthority(c),
    spendingLimits: spendingLimits(c),
  });
  return protocol("sweep", [control("CODE", ms), control("FUNDS", ms)], { exitLatency: c.exitLatency });
}

/** Cartesian product, written as recursion so no loop sits inside another. */
function product<T>(lists: T[][]): T[][] {
  if (!lists.length) return [[]];
  const [first, ...rest] = lists;
  const tails = product(rest);
  return first!.flatMap((item) => tails.map((tail) => [item, ...tail]));
}

function configs(): Config[] {
  const sizes = Array.from({ length: 7 }, (_, i) => i + 1);
  const shapes = sizes.flatMap((n) => Array.from({ length: n }, (_, i) => ({ n, k: i + 1 })));
  const rows = product<unknown>([
    shapes,
    TIMELOCKS,
    [...CONFIG_AUTHORITIES],
    [...LIMITS],
    ["none", "below", "at"],
    [false, true],
    [false, true],
    [0, 2 * DAY],
  ]);
  return rows.map(([shape, timelock, ca, limit, nonce, exposed, linked, exitLatency]) => {
    const { n, k } = shape as { n: number; k: number };
    const nonceCount = nonce === "none" ? 0 : nonce === "below" ? k - 1 : k;
    return {
      n,
      k,
      timelock: timelock as number,
      ca: ca as Config["ca"],
      limit: limit as Config["limit"],
      nonceCount,
      exposedCount: exposed ? k : 0,
      linked: linked as boolean,
      exitLatency: exitLatency as ExitLatency,
    };
  });
}

interface Summary {
  grade: Grade;
  red: boolean;
  code: Grade | null;
  funds: Grade | null;
  presign: boolean;
}

const memo = new Map<string, Summary>();

function summarize(c: Config): Summary {
  const id = JSON.stringify(c);
  const cached = memo.get(id);
  if (cached) return cached;
  const posture = postureOf(build(c));
  const summary: Summary = {
    grade: posture.grade as Grade,
    red: posture.red,
    code: posture.byCapability.get("CODE") ?? null,
    funds: posture.byCapability.get("FUNDS") ?? null,
    presign: posture.controls.some((r) => r.reasons.some((reason) => reason.includes("durable nonce"))),
  };
  memo.set(id, summary);
  return summary;
}

const notWorse = (from: Grade, to: Grade) => gradeGap(from, to) <= 0;

export interface PropertyResult {
  name: string;
  checked: number;
  failures: string[];
}

type Rule = (c: Config, s: Summary) => string | null;

/** Each rule returns a failure message or null. */
const RULES: Record<string, Rule> = {
  "a coverage gap only ever turns A into B, and never changes red": (c, s) => {
    const base = build(c);
    const gapped = postureOf({ ...base, expected: ["CODE", "FUNDS", "RISK"] });
    const want = s.grade === "A" ? "B" : s.grade;
    if (gapped.grade !== want) return `with RISK unmapped: ${gapped.grade}, expected ${want}`;
    return gapped.red === s.red ? null : "a coverage gap changed red";
  },
  "a power marked as only making things safer is never graded and never worsens the grade": (c, s) => {
    const base = build(c);
    const marked = postureOf({
      ...base,
      controls: base.controls.map((x) => (x.capability === "FUNDS" ? { ...x, protective: "lab" } : x)),
    });
    if (marked.byCapability.get("FUNDS") !== null) return "a protective FUNDS power was graded";
    if (marked.grade !== (s.code ?? "A") && marked.grade !== "unverified")
      return `protective: ${marked.grade}, CODE alone is ${s.code}`;
    return marked.red === (s.code === "F") ? null : "protective FUNDS still decides red";
  },
  "a power the deployed code cannot exercise is never graded": (c) => {
    const base = build(c);
    const dead = postureOf({
      ...base,
      controls: base.controls.map((x) => (x.capability === "FUNDS" ? { ...x, limit: { share: 0, source: "lab" } } : x)),
    });
    return dead.byCapability.get("FUNDS") === null ? null : "a power with no instruction was graded";
  },
  "a cap under 5% of deposits keeps a power between A and D and never red; 5% or more changes nothing": (c, s) => {
    const base = build(c);
    const capWith = (share: number) =>
      postureOf({
        ...base,
        controls: base.controls.map((x) => (x.capability === "FUNDS" ? { ...x, limit: { share, source: "lab" } } : x)),
      });
    const small = capWith(MATERIAL_SHARE / 2);
    const funds = small.byCapability.get("FUNDS");
    if (funds === "F") return "a capped power graded F";
    if (small.controls.some((r) => r.control.capability === "FUNDS" && r.red)) return "a capped power is red";
    if (funds && s.funds && gradeGap(s.funds, funds) > 0) return `a cap made FUNDS worse: ${s.funds} → ${funds}`;
    const large = capWith(MATERIAL_SHARE);
    return large.grade === s.grade && large.red === s.red ? null : `a 5% cap changed ${s.grade} to ${large.grade}`;
  },
  "same answer every time": (c, s) => {
    memo.delete(JSON.stringify(c));
    const again = summarize(c);
    return again.grade === s.grade && again.red === s.red ? null : "different result on a second run";
  },
  "signer order does not matter": (c, s) => {
    const reversed = postureOf(build(c, true));
    return reversed.grade === s.grade && reversed.red === s.red ? null : `reversed order gives ${reversed.grade}`;
  },
  "red exactly when a drain path is F": (_c, s) => {
    const expected = s.code === "F" || s.funds === "F";
    return s.red === expected ? null : `red=${s.red} but F=${expected}`;
  },
  "A only with 30 usable days on a known exit time": (c, s) => {
    if (s.grade !== "A") return null;
    const usable = c.exitLatency === "unknown" ? 0 : c.timelock - c.exitLatency;
    return usable >= 30 * DAY ? null : `A with ${usable / DAY} usable days`;
  },
  "B or better needs at least a day of usable delay": (c, s) => {
    if (s.grade !== "A" && s.grade !== "B") return null;
    const usable = c.exitLatency === "unknown" ? c.timelock : c.timelock - c.exitLatency;
    return usable >= DAY ? null : `${s.grade} with ${usable / HOUR} usable hours`;
  },
  "an unknown exit time never beats a known immediate exit": (c, s) => {
    if (c.exitLatency !== 0) return null;
    const unknown = summarize({ ...c, exitLatency: "unknown" });
    if (!notWorse(unknown.grade, s.grade)) return `unknown exit ${unknown.grade} better than ${s.grade}`;
    return unknown.grade === "A" ? "A with an unknown exit time" : null;
  },
  "a one-key config authority is always red": (c, s) =>
    (c.ca === "key" || c.ca === "1of2") && !s.red ? `not red with config authority ${c.ca}` : null,
  "an open spending limit always makes FUNDS F": (c, s) =>
    c.limit === "open" && s.funds !== "F" ? `FUNDS ${s.funds} with an open spending limit` : null,
  "small or protocol-only limits change nothing": (c, s) => {
    if (c.limit !== "small" && c.limit !== "protocol-only") return null;
    const without = summarize({ ...c, limit: "none" });
    return without.funds === s.funds ? null : `FUNDS ${s.funds} vs ${without.funds} without the limit`;
  },
  "a longer timelock never hurts": (c, s) => {
    const next = TIMELOCKS[TIMELOCKS.indexOf(c.timelock) + 1];
    if (next === undefined) return null;
    const longer = summarize({ ...c, timelock: next });
    return notWorse(s.grade, longer.grade) && (s.red || !longer.red) ? null : `${s.grade} → ${longer.grade}`;
  },
  "a higher threshold never hurts": (c, s) => {
    if (c.k + 1 > c.n) return null;
    const higher = summarize({ ...c, k: c.k + 1 });
    return notWorse(s.grade, higher.grade) && (s.red || !higher.red) ? null : `${s.grade} → ${higher.grade}`;
  },
  "removing a config authority or spending limit never hurts": (c, s) => {
    const noCa = summarize({ ...c, ca: "none" });
    const noLimit = summarize({ ...c, limit: "none" });
    const ok = notWorse(s.grade, noCa.grade) && notWorse(s.grade, noLimit.grade);
    return ok ? null : `${s.grade} → ${noCa.grade} / ${noLimit.grade}`;
  },
  "linked keys never look better": (c, s) => {
    const linked = summarize({ ...c, linked: true });
    return notWorse(linked.grade, s.grade) || c.linked ? null : `linked ${linked.grade} better than ${s.grade}`;
  },
  "hot wallets are a flag: they never change a grade or red": (c, s) => {
    if (!c.exposedCount) return null;
    const cold = summarize({ ...c, exposedCount: 0 });
    return cold.grade !== s.grade || cold.red !== s.red
      ? `hot ${s.grade}/${s.red}, cold ${cold.grade}/${cold.red}`
      : null;
  },
  "nonce accounts are a flag: they never change a grade or red": (c, s) => {
    if (!c.nonceCount) return null;
    const none = summarize({ ...c, nonceCount: 0 });
    return none.grade !== s.grade || none.red !== s.red
      ? `nonce ${s.grade}/${s.red}, none ${none.grade}/${none.red}`
      : null;
  },
  "a slower exit never helps": (c, s) => {
    if (c.exitLatency) return null;
    const slow = summarize({ ...c, exitLatency: 2 * DAY });
    return notWorse(slow.grade, s.grade) ? null : `slow exit ${slow.grade} better than ${s.grade}`;
  },
  "adding a signer never hurts": (c, s) => {
    if (c.n >= 7) return null;
    const bigger = summarize({ ...c, n: c.n + 1 });
    return notWorse(s.grade, bigger.grade) && (s.red || !bigger.red)
      ? null
      : `${s.grade} → ${bigger.grade} with ${c.n + 1} signers`;
  },
  "an unchanged state raises no events": (c) => {
    const events = diff(build(c), build(c), 0);
    return events.length ? `events: ${events.map((e) => e.type).join(", ")}` : null;
  },
  "removing the delay is reported by where it lands": (c, s) => {
    if (c.timelock === 0) return null;
    const instant = { ...c, timelock: 0 };
    const after = summarize(instant);
    const events = diff(build(c), build(instant), 0);
    const backwards = diff(build(instant), build(c), 0).filter((e) => e.type === "WEAKENED");
    if (backwards.length) return "restoring the delay was reported as a weakening";
    const capabilities: [Capability, Grade | null, Grade | null][] = [
      ["CODE", s.code, after.code],
      ["FUNDS", s.funds, after.funds],
    ];
    const missing = capabilities.filter(([capability, from, to]) => {
      if (!from || !to || gradeGap(from, to) <= 0) return false;
      return !events.some(
        (e) => e.type === "WEAKENED" && e.capability === capability && e.severity === severityFor(to),
      );
    });
    return missing.length ? `missing WEAKENED for ${missing.map(([cap]) => cap).join(", ")}` : null;
  },
};

function checkRule(name: string, rule: Rule, all: Config[]): PropertyResult {
  const failures = all.flatMap((c) => {
    const message = rule(c, summarize(c));
    return message ? [`${message} | ${JSON.stringify(c)}`] : [];
  });
  return { name, checked: all.length, failures };
}

export interface SweepStats {
  configs: number;
  grades: Record<string, number>;
  red: number;
  /** single-setting changes that move the grade three or more steps (not counting removing a bypass) */
  cliffs: string[];
}

function cliffsFor(c: Config): string[] {
  const s = summarize(c);
  const next = TIMELOCKS[TIMELOCKS.indexOf(c.timelock) + 1];
  const neighbours: [string, Config | null][] = [
    ["timelock up", next === undefined ? null : { ...c, timelock: next }],
    ["threshold +1", c.k < c.n ? { ...c, k: c.k + 1 } : null],
    ["signer +1", c.n < 7 ? { ...c, n: c.n + 1 } : null],
  ];
  return neighbours.flatMap(([label, other]) => {
    if (!other) return [];
    const gap = Math.abs(gradeGap(s.grade, summarize(other).grade));
    return gap >= 3 ? [`${label}: ${s.grade} → ${summarize(other).grade} | ${JSON.stringify(c)}`] : [];
  });
}

export function runSweep(): { results: PropertyResult[]; stats: SweepStats } {
  const all = configs();
  const results = Object.entries(RULES).map(([name, rule]) => checkRule(name, rule, all));
  const summaries = all.map((c) => summarize(c));
  const grades = Object.fromEntries(GRADES.map((g) => [g, summaries.filter((s) => s.grade === g).length]));
  const cliffs = all.flatMap(cliffsFor);
  return { results, stats: { configs: all.length, grades, red: summaries.filter((s) => s.red).length, cliffs } };
}

// ───────────────────────────── 2. the brute-force oracle ─────────────────────────────

/** Small seeded random generator, so failures can be replayed. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Generator {
  next: () => number;
  pool: Key[];
  counter: number;
}

const pick = <T>(g: Generator, items: T[]): T => items[Math.floor(g.next() * items.length)]!;

function randomKey(g: Generator): Key {
  return pick(g, g.pool);
}

function randomMultisig(g: Generator, depth: number, capability: Capability): Multisig {
  const size = 2 + Math.floor(g.next() * 4);
  const members = Array.from({ length: size }, () => randomAuthority(g, depth + 1, capability));
  const threshold = 1 + Math.floor(g.next() * size);
  const ca = g.next() < 0.15 ? randomAuthority(g, depth + 1, capability) : null;
  const limit =
    g.next() < 0.15
      ? [{ users: [randomKey(g)], share: g.next() * 0.4, destinations: pick(g, ["any", "protocol"] as const) }]
      : [];
  g.counter += 1;
  return multisig(`m${g.counter}`, threshold, members, pick(g, TIMELOCKS), {
    configAuthority: ca,
    spendingLimits: limit,
  });
}

function randomDao(g: Generator): Dao {
  const count = 2 + Math.floor(g.next() * 4);
  const weights = Array.from({ length: count }, () => 0.1 + g.next());
  const total = weights.reduce((sum, w) => sum + w, 0);
  const holders = weights.map((w) => ({ who: randomKey(g) as Authority, share: w / total }));
  g.counter += 1;
  return {
    kind: "dao",
    id: `d${g.counter}`,
    holders,
    passShare: 0.3 + g.next() * 0.4,
    votingTime: pick(g, [0, DAY, 3 * DAY]),
    holdUp: pick(g, [0, DAY]),
    tipping: pick(g, ["early", "strict"] as const),
    veto: g.next() < 0.3,
    council: g.next() < 0.3 ? { members: [randomKey(g), randomKey(g), randomKey(g)], threshold: 2 } : null,
    realmAuthority: g.next() < 0.15 ? randomKey(g) : null,
  };
}

function randomAuthority(g: Generator, depth: number, capability: Capability): Authority {
  const roll = g.next();
  if (depth >= 3 || roll < 0.45) return randomKey(g);
  if (roll < 0.85) return randomMultisig(g, depth, capability);
  if (roll < 0.93 && depth <= 1) return randomDao(g);
  return roll < 0.97 ? { kind: "unknown", id: `u${depth}` } : { kind: "immutable" };
}

const clusterOf = (k: Key) => k.cluster ?? k.id;

/** Fastest delay with which the keys in `owned` can exercise the capability (Infinity: they cannot). */
function minDelay(authority: Authority, owned: Set<string>, capability: Capability): number {
  if (authority.kind === "key") return owned.has(clusterOf(authority)) ? 0 : Infinity;
  if (authority.kind === "immutable" || authority.kind === "unknown") return Infinity;
  if (authority.kind === "multisig") return multisigDelay(authority, owned, capability);
  return daoDelay(authority, owned, capability);
}

function multisigDelay(ms: Multisig, owned: Set<string>, capability: Capability): number {
  const voters = ms.members.filter((m) => m.vote !== false).map((m) => minDelay(m.who, owned, capability));
  const ready = voters.filter(Number.isFinite).sort((a, b) => a - b);
  const vote = ms.threshold >= 1 && ready.length >= ms.threshold ? ms.timelock + ready[ms.threshold - 1]! : Infinity;
  const ca = ms.configAuthority ? minDelay(ms.configAuthority, owned, capability) : Infinity;
  const draining = (ms.spendingLimits ?? []).filter((l) => l.share >= MATERIAL_SHARE && l.destinations === "any");
  const users = draining
    .flatMap((l) => l.users)
    .map((u) => (capability === "FUNDS" ? minDelay(u, owned, capability) : Infinity));
  return Math.min(vote, ca, ...users);
}

function daoDelay(dao: Dao, owned: Set<string>, capability: Capability): number {
  const ready = dao.holders.filter((h) => Number.isFinite(minDelay(h.who, owned, capability)));
  const votes = ready.reduce((sum, h) => sum + h.share, 0) >= dao.passShare ? 0 : Infinity;
  const councilReady = (dao.council?.members ?? []).filter((m) => Number.isFinite(minDelay(m, owned, capability)));
  const council = dao.council && councilReady.length >= dao.council.threshold ? 0 : Infinity;
  const bypass = [dao.realmAuthority, dao.councilMintAuthority, dao.pluginUpgradeAuthority]
    .filter((a): a is Authority => !!a)
    .map((a) => minDelay(a, owned, capability));
  const fastest = Math.min(votes, council, ...bypass);
  return fastest + (dao.tipping === "early" ? 0 : dao.votingTime) + dao.holdUp;
}

/** `q` needs no more keys and no more time than `p`, and is strictly better on one of them. */
const beats = (q: number[], p: number[]) => q[0]! <= p[0]! && q[1]! <= p[1]! && (q[0]! < p[0]! || q[1]! < p[1]!);
const isBeaten = (p: number[], all: number[][]) => all.some((q) => beats(q, p));

/** Pareto front of (number of keys, delay): the cheapest combinations an attacker could pick. */
function front(points: [number, number][]): string {
  const unique = [...new Set(points.map(([keys, delay]) => `${keys}@${delay}`))].map((s) => s.split("@").map(Number));
  const kept = unique.filter((p) => !isBeaten(p, unique));
  return kept
    .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
    .map(([keys, delay]) => `${keys}@${delay}`)
    .join(" ");
}

function subsets(items: string[]): Set<string>[] {
  return Array.from({ length: 1 << items.length }, (_, mask) => new Set(items.filter((_, bit) => mask & (1 << bit))));
}

function bruteFront(authority: Authority, capability: Capability, clusters: string[]): string {
  const points = subsets(clusters).flatMap((owned) => {
    const delay = minDelay(authority, owned, capability);
    return Number.isFinite(delay) ? [[owned.size, delay] as [number, number]] : [];
  });
  return front(points);
}

function engineFront(authority: Authority, capability: Capability): string {
  const { paths } = pathsFor(authority, capability);
  return front(paths.map((path) => [path.holders.length, path.delay] as [number, number]));
}

export function runOracle(count = 4000, seed = 7): PropertyResult {
  const g: Generator = { next: random(seed), pool: [], counter: 0 };
  const failures = Array.from({ length: count }, (_, index) => {
    const linked = g.next() < 0.3;
    g.pool = Array.from({ length: 7 }, (_, i) => key(`p${i}`, { cluster: linked && i < 3 ? "linked" : undefined }));
    const capability = pick(g, ["CODE", "FUNDS"] as Capability[]);
    const root = randomAuthority(g, 0, capability);
    const clusters = [...new Set(g.pool.map(clusterOf))];
    const expected = bruteFront(root, capability, clusters);
    const actual = engineFront(root, capability);
    const tree = process.env.ORACLE_TREES ? ` ${capability} ${JSON.stringify(root)}` : "";
    return expected === actual
      ? null
      : `case ${index}: brute force ${expected || "none"}, engine ${actual || "none"}${tree}`;
  }).filter((x): x is string => !!x);
  return { name: "keys-to-steal and delay match a brute force over every subset of keys", checked: count, failures };
}

/** Over random trees with unreadable parts: "unverified" never hides a known D or F, and never shows a red. */
export function runUnverified(count = 4000, seed = 11): PropertyResult {
  const g: Generator = { next: random(seed), pool: [], counter: 0 };
  const failures = Array.from({ length: count }, (_, index) => {
    g.pool = Array.from({ length: 7 }, (_, i) => key(`p${i}`));
    const controls = (["CODE", "FUNDS"] as Capability[]).map((capability) =>
      control(capability, randomAuthority(g, 0, capability)),
    );
    const posture = postureOf(protocol("u", controls));
    if (posture.grade !== "unverified") return null;
    const knownBad = posture.controls.some((r) => r.grade === "D" || r.grade === "F");
    if (knownBad) return `case ${index}: unverified hides a known ${posture.controls.map((r) => r.grade).join("/")}`;
    if (posture.red) return `case ${index}: unverified while red`;
    return posture.provisional ? null : `case ${index}: unverified with nothing unread`;
  }).filter((x): x is string => !!x);
  return { name: "unverified never hides a known D or F or a red", checked: count, failures };
}

export const drainCapabilities = (["CODE", "FUNDS", "MINT", "PRICE", "RISK", "BRIDGE", "STAKE"] as Capability[]).filter(
  isDrain,
);
