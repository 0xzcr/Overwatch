/**
 * Proposed Overwatch ruleset (v3), as an executable spec.
 *
 * Posture: for every capability, list every way an attacker could exercise it (a path) and grade the cheapest one on
 * a grid of "keys to steal" × "delay before it takes effect".
 * Monitor: replays a timeline of snapshots, transaction-stream states, signals and proposals, and raises events.
 */
import type {
  Authority,
  Capability,
  Control,
  Dao,
  ExitLatency,
  Grade,
  Key,
  Multisig,
  Protocol,
  Severity,
} from "./model";
import { DAY, GRADES, HOUR, MINUTE, SEVERITIES } from "./model";

// ───────────────────────────── tunable constants ─────────────────────────────

/** a spending limit that can move at least this share of the vault per period can drain it */
export const MATERIAL_SHARE = 0.05;
/** steps of a takeover sequence count together inside these windows */
export const PREPARE_TO_CONTROL = 14 * DAY;
export const CONTROL_TO_ARM = 72 * HOUR;
export const ARM_TO_EXTRACT = 1 * HOUR;
/** red from a takeover sequence clears after this long with no new step */
export const SEQUENCE_COOL_OFF = 7 * DAY;
/** approvals this soon after a proposal is created were probably signed in advance */
export const PRESIGN_WINDOW = 1 * MINUTE;
/** small step-downs that add up to this many grades, or grid cells, inside the window raise one alert */
export const RATCHET_STEPS = 2;
export const RATCHET_WINDOW = 90 * DAY;
/** an announcement must be posted this long before the change to count */
export const ANNOUNCE_LEAD = 24 * HOUR;

const DRAIN: Capability[] = ["CODE", "FUNDS", "MINT", "PRICE", "RISK", "BRIDGE", "STAKE"];
export const isDrain = (capability: Capability) => DRAIN.includes(capability);

// ───────────────────────────── paths ─────────────────────────────

/** One way for an attacker to exercise a capability. */
export interface Path {
  /** independent key holders that must be compromised (cluster ids, sorted, unique) */
  holders: string[];
  /** seconds before the change takes effect */
  delay: number;
  /** honest signers can cancel the change during the delay */
  cancellable: boolean;
}

export interface PathSet {
  paths: Path[];
  /** part of the tree could not be decoded (or loops back on itself) */
  provisional: boolean;
}

const NONE: PathSet = { paths: [], provisional: false };
const EMPTY_PATH: Path = { holders: [], delay: 0, cancellable: false };

/** Two paths taken together: both sets of keys, the slower of the two delays. */
function merge(a: Path, b: Path): Path {
  return {
    holders: [...new Set([...a.holders, ...b.holders])].sort(),
    delay: Math.max(a.delay, b.delay),
    cancellable: a.cancellable || b.cancellable,
  };
}

const isSubset = (small: string[], big: string[]) => small.every((holder) => big.includes(holder));

/** `a` is at least as good for the attacker as `b` on every count. */
function dominates(a: Path, b: Path): boolean {
  return isSubset(a.holders, b.holders) && a.delay <= b.delay && (!a.cancellable || b.cancellable);
}

const isDominated = (path: Path, kept: Path[]) => kept.some((other) => dominates(other, path));

/** Keep only paths no other path beats. Cheapest first, so a dominated path always meets its better first. */
function prune(paths: Path[]): Path[] {
  const sorted = [...paths].sort((a, b) => a.holders.length - b.holders.length || a.delay - b.delay);
  return sorted.reduce<Path[]>((kept, path) => (isDominated(path, kept) ? kept : [...kept, path]), []);
}

/** Above this many combinations, a big multisig is covered greedily instead of exactly. */
export const MAX_COMBINATIONS = 60_000;
let combinationBudget = MAX_COMBINATIONS;
/** Test hook: force the greedy cover so it can be compared with the exact answer. */
export const setCombinationBudget = (budget: number) => {
  combinationBudget = budget;
};

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

/** Every way to satisfy `need` of the children, taking one path from each chosen child. */
function chooseThreshold(children: Path[][], need: number): Path[] {
  const able = children.filter((paths) => paths.length > 0);
  if (able.length < need) return [];
  if (binomial(able.length, need) > combinationBudget) return greedyThreshold(able, need);
  const results: Path[] = [];
  const walk = (index: number, remaining: number, sofar: Path) => {
    if (remaining === 0) {
      results.push(sofar);
      return;
    }
    if (able.length - index < remaining) return; // not enough children left to reach the threshold
    walk(index + 1, remaining, sofar); // leave this child out
    able[index]!.forEach((path) => walk(index + 1, remaining - 1, merge(sofar, path)));
  };
  walk(0, need, EMPTY_PATH);
  return prune(results);
}

const newHolders = (path: Path, sofar: Path) => path.holders.filter((h) => !sofar.holders.includes(h)).length;
const sameParty = (path: Path, all: Path[]) =>
  all.filter((other) => other.holders.join() === path.holders.join()).length;

/**
 * Greedy cover for very large multisigs: keep taking the member that adds the fewest new keys (members held by the
 * same party first). shortcut: exact for members that are plain keys; nested members use their cheapest path.
 */
function greedyThreshold(children: Path[][], need: number): Path[] {
  const cheapest = children.map((paths) => paths[0]!);
  const better = (a: Path, b: Path, sofar: Path, pool: Path[]) =>
    newHolders(a, sofar) - newHolders(b, sofar) || sameParty(b, pool) - sameParty(a, pool) || a.delay - b.delay;
  const take = (pool: Path[], remaining: number, sofar: Path): Path => {
    if (remaining === 0) return sofar;
    const best = pool.reduce((a, b) => (better(a, b, sofar, pool) <= 0 ? a : b));
    return take(
      pool.filter((path) => path !== best),
      remaining - 1,
      merge(sofar, best),
    );
  };
  return [take(cheapest, need, EMPTY_PATH)];
}

/** The attacker who holds `holders` can also act as this member. */
const heldBy = (member: PathSet, holders: string[]) => member.paths.some((path) => isSubset(path.holders, holders));

/** Add a gate's own delay and cancel rule to every path that goes through it. */
const throughGate = (paths: Path[], delay: number, cancellable: boolean) =>
  paths.map((path) => ({
    holders: path.holders,
    delay: path.delay + delay,
    cancellable: path.cancellable || (delay > 0 && cancellable),
  }));

const combine = (sets: PathSet[]): PathSet => ({
  paths: prune(sets.flatMap((set) => set.paths)),
  provisional: sets.some((set) => set.provisional),
});

function keyPaths(key: Key): PathSet {
  const path: Path = { holders: [key.cluster ?? key.id], delay: 0, cancellable: false };
  return { paths: [path], provisional: false };
}

function multisigPaths(ms: Multisig, capability: Capability, visiting: Set<string>): PathSet {
  const voters = ms.members.filter((member) => member.vote !== false);
  const voterSets = voters.map((member) => pathsFor(member.who, capability, visiting));
  const validThreshold = ms.threshold >= 1 && Number.isInteger(ms.threshold);

  // 1. the normal route: enough voters approve, then the timelock runs
  const approved = validThreshold
    ? chooseThreshold(
        voterSets.map((set) => set.paths),
        ms.threshold,
      )
    : [];
  // during the timelock, voters the attacker does not hold can cancel, if there are enough of them
  const gated = approved.map((path) => {
    const honest = voterSets.filter((set) => set.paths.length > 0 && !heldBy(set, path.holders)).length;
    return {
      holders: path.holders,
      delay: path.delay + ms.timelock,
      cancellable: path.cancellable || (ms.timelock > 0 && honest >= ms.threshold),
    };
  });
  const votePaths: PathSet = {
    paths: prune(gated),
    provisional: !validThreshold || voterSets.some((set) => set.provisional),
  };

  // 2. a config authority rewrites the multisig instantly, with no vote and no timelock
  const configAuthority = ms.configAuthority ? pathsFor(ms.configAuthority, capability, visiting) : NONE;

  // 3. a material spending limit with open destinations moves funds instantly
  const spending = capability === "FUNDS" ? spendingPaths(ms, capability, visiting) : NONE;

  return combine([votePaths, configAuthority, spending]);
}

function spendingPaths(ms: Multisig, capability: Capability, visiting: Set<string>): PathSet {
  const draining = (ms.spendingLimits ?? []).filter(
    (limit) => limit.share >= MATERIAL_SHARE && limit.destinations === "any",
  );
  const users = draining.flatMap((limit) => limit.users);
  return combine(users.map((user) => pathsFor(user, capability, visiting)));
}

/** Only the largest voting blocs are combined; smaller ones rarely decide a vote. */
export const MAX_BLOCS = 16;

/**
 * Every coalition of voting blocs that can pass a vote. Wallets held by the same party vote as one bloc.
 * shortcut: a multisig holder contributes only its cheapest path; exact when holders are keys.
 */
function holderPaths(dao: Dao, capability: Capability, visiting: Set<string>): PathSet {
  const usable = dao.holders
    .map((holder) => ({ share: holder.share, set: pathsFor(holder.who, capability, visiting) }))
    .filter((holder) => holder.set.paths.length > 0);
  const blocs = new Map<string, { share: number; path: Path }>();
  usable.forEach((holder) => {
    const path = holder.set.paths[0]!;
    const id = path.holders.join("+");
    blocs.set(id, { share: (blocs.get(id)?.share ?? 0) + holder.share, path });
  });
  const top = [...blocs.values()].sort((a, b) => b.share - a.share).slice(0, MAX_BLOCS);
  const remaining = top.map((_, i) => top.slice(i).reduce((sum, bloc) => sum + bloc.share, 0));

  const coalitions: Path[] = [];
  const walk = (index: number, total: number, sofar: Path) => {
    if (total >= dao.passShare) {
      coalitions.push(sofar); // adding more blocs only makes a bigger coalition
      return;
    }
    if (index >= top.length || total + remaining[index]! < dao.passShare) return;
    walk(index + 1, total + top[index]!.share, merge(sofar, top[index]!.path));
    walk(index + 1, total, sofar);
  };
  walk(0, 0, EMPTY_PATH);
  if (!coalitions.length) coalitions.push(...largestFirst([...blocs.values()], dao.passShare));
  return { paths: prune(coalitions), provisional: usable.some((holder) => holder.set.provisional) };
}

/** Largest blocs first until the vote passes (for DAOs where the top blocs alone cannot pass). */
function largestFirst(blocs: { share: number; path: Path }[], passShare: number): Path[] {
  let total = 0;
  let sofar = EMPTY_PATH;
  for (const bloc of [...blocs].sort((a, b) => b.share - a.share)) {
    if (total >= passShare) break;
    total += bloc.share;
    sofar = merge(sofar, bloc.path);
  }
  return total >= passShare ? [sofar] : [];
}

function daoPaths(dao: Dao, capability: Capability, visiting: Set<string>): PathSet {
  const votes = holderPaths(dao, capability, visiting);
  const councilSets = (dao.council?.members ?? []).map((member) => pathsFor(member, capability, visiting));
  const council: PathSet = {
    paths: dao.council
      ? chooseThreshold(
          councilSets.map((set) => set.paths),
          dao.council.threshold,
        )
      : [],
    provisional: councilSets.some((set) => set.provisional),
  };
  // each of these can hand itself enough votes to pass anything
  const bypasses = [dao.realmAuthority, dao.councilMintAuthority, dao.pluginUpgradeAuthority]
    .filter((authority): authority is Authority => !!authority)
    .map((authority) => pathsFor(authority, capability, visiting));

  const all = combine([votes, council, ...bypasses]);
  const delay = (dao.tipping === "early" ? 0 : dao.votingTime) + dao.holdUp;
  return { paths: prune(throughGate(all.paths, delay, dao.veto)), provisional: all.provisional };
}

/** Every cheapest way to exercise `capability` through `authority`. */
export function pathsFor(authority: Authority, capability: Capability, visiting: Set<string> = new Set()): PathSet {
  if (authority.kind === "key") return keyPaths(authority);
  if (authority.kind === "immutable") return NONE;
  if (authority.kind === "unknown") return { paths: [], provisional: true };
  // a controller that (through its members) controls itself cannot be resolved: treat it as unknown
  if (visiting.has(authority.id)) return { paths: [], provisional: true };
  const inside = new Set([...visiting, authority.id]);
  if (authority.kind === "multisig") return multisigPaths(authority, capability, inside);
  return daoPaths(authority, capability, inside);
}

// ───────────────────────────── grading ─────────────────────────────

/**
 * rows: keys to steal (1, 2, 3, 4+); columns: no delay, under 24h, 24h to 7d, 7d to 30d, 30d or more.
 * The 7-day and 30-day lines are the exit windows L2BEAT and DeFiScan use; A needs the 30-day one.
 */
const GRID: Grade[][] = [
  ["F", "F", "D", "C", "B"],
  ["F", "D", "C", "B", "A"],
  ["D", "C", "C", "B", "A"],
  ["C", "C", "B", "B", "A"],
];

export const EXIT_WINDOW = 7 * DAY;
export const LONG_EXIT_WINDOW = 30 * DAY;

export function columnFor(delay: number): number {
  if (delay <= 0) return 0;
  if (delay < DAY) return 1;
  if (delay >= LONG_EXIT_WINDOW) return 4;
  if (delay >= EXIT_WINDOW) return 3;
  return 2;
}

/** The delay users can actually use: what is left after the time they need to withdraw. */
export function usableDelay(delay: number, exitLatency: ExitLatency): number {
  // with no exit time on file, a delay is never credited as a full exit window
  if (exitLatency === "unknown") return Math.min(delay, EXIT_WINDOW - 1);
  return Math.max(0, delay - exitLatency);
}

export const keysFor = (path: Path) => Math.max(1, path.holders.length);

export function gradePath(path: Path, exitLatency: ExitLatency = 0): Grade {
  const row = Math.min(keysFor(path), 4) - 1;
  const delay = usableDelay(path.delay, exitLatency); // a delay shorter than the time to withdraw protects no one
  return GRID[row]![columnFor(delay)]!;
}

const rank = (grade: Grade) => GRADES.indexOf(grade);
export const worse = (a: Grade, b: Grade) => (rank(a) >= rank(b) ? a : b);
export const better = (a: Grade, b: Grade) => (rank(a) <= rank(b) ? a : b);
export const worst = (grades: Grade[]) => grades.reduce<Grade>((sofar, grade) => worse(sofar, grade), "A");
export const stepWorse = (grade: Grade) => GRADES[Math.min(rank(grade) + 1, GRADES.length - 1)]!;
export const gradeGap = (from: Grade, to: Grade) => rank(to) - rank(from);

export interface ControlResult {
  control: Control;
  /** null: nobody can do this (immutable) or it is a stated trust assumption */
  grade: Grade | null;
  provisional: boolean;
  red: boolean;
  reasons: string[];
  paths: Path[];
}

/** Half the voting signers or fewer are enough to act. */
const isMinorityMultisig = (authority: Authority) =>
  authority.kind === "multisig" &&
  authority.threshold * 2 <= authority.members.filter((member) => member.vote !== false).length;

/** Holders (clusters) with at least one key carrying the flag. */
function flaggedHolders(by: Authority, flag: (key: Key) => boolean): Set<string> {
  const reachable = allAuthorities({ id: "", controls: [{ capability: "CODE", label: "", by }] });
  const flagged = reachable.filter((a): a is Key => a.kind === "key" && flag(a));
  return new Set(flagged.map((k) => k.cluster ?? k.id));
}

const onlyFrom = (path: Path, holders: Set<string>) => path.holders.every((holder) => holders.has(holder));

function gradeControl(control: Control, exitLatency: ExitLatency): ControlResult {
  if (control.trusted) {
    const reasons = [`trust assumption: ${control.trusted}`];
    return { control, grade: null, provisional: false, red: false, reasons, paths: [] };
  }
  if (control.capability === "PAUSE") {
    const reasons = ["pause of new activity only: listed, not graded"];
    return { control, grade: null, provisional: false, red: false, reasons, paths: [] };
  }
  const reasons: string[] = [];
  const { paths, provisional } = pathsFor(control.by, control.capability);
  const grades = paths.map((path) => gradePath(path, exitLatency));
  let grade: Grade | null = grades.length ? worst(grades) : null;

  if (grade && control.unverified && control.capability === "CODE") {
    grade = worse(grade, "B");
    reasons.push("code does not match a verified build");
  }
  if (provisional) {
    grade = worse(grade ?? "A", "C");
    reasons.push("part of the control path is unknown");
  }
  // hot wallets are a guess about how a key is kept: shown as a flag, never part of the grade
  const hot = flaggedHolders(control.by, (key) => !!key.exposed);
  const exposedReachWorst = paths.some((path) => gradePath(path, exitLatency) === grade && onlyFrom(path, hot));
  if (grade && exposedReachWorst) reasons.push("flag: the signers on the cheapest path are hot wallets");

  // a cancel depends on people reacting in time, so it is shown and not graded
  const cancellable = paths.some((path) => gradePath(path, exitLatency) === grade && path.cancellable);
  if (grade && cancellable) reasons.push("flag: the other signers can cancel this during the delay");

  // the standards ask a council for a 51% threshold. Fewer is a flag: the grade already counts the keys to steal
  const minority = allAuthorities({ id: "", controls: [control] }).some(isMinorityMultisig);
  if (grade && minority) reasons.push("flag: a multisig here lets half its signers or fewer act");

  // blocking withdrawals can be undone and a drain cannot, so it never grades below D
  if (grade && control.capability === "FREEZE") grade = better(grade, "D");

  // any signer can be talked into pre-signing with a nonce account the attacker owns, so holding one proves
  // nothing about the risk. The timelock is the defence and the grid already grades it. This is a flag only.
  const nonceHolders = flaggedHolders(control.by, (key) => !!key.nonce);
  const presignable = isDrain(control.capability) && paths.some((p) => p.delay === 0 && onlyFrom(p, nonceHolders));
  if (presignable) reasons.push("flag: enough signers hold durable nonce accounts to act with no delay");

  const red = isDrain(control.capability) && grade === "F";
  return { control, grade, provisional, red, reasons, paths };
}

/** The path that sets a capability's grade: worst grade, then fewest keys, then shortest delay. */
export interface Weakest {
  grade: Grade;
  keys: number;
  delay: number;
}

const isWeaker = (a: Weakest, b: Weakest) => {
  if (a.grade !== b.grade) return rank(a.grade) > rank(b.grade);
  if (a.keys !== b.keys) return a.keys < b.keys;
  return a.delay < b.delay;
};

function weakestPaths(controls: ControlResult[], exitLatency: ExitLatency): Map<Capability, Weakest> {
  const facts = controls.flatMap((result) => pathFacts(result, exitLatency));
  const weakest = new Map<Capability, Weakest>();
  facts.forEach(({ capability, fact }) => {
    const sofar = weakest.get(capability);
    if (!sofar || isWeaker(fact, sofar)) weakest.set(capability, fact);
  });
  return weakest;
}

const pathFacts = (result: ControlResult, exitLatency: ExitLatency) =>
  result.paths.map((path) => ({
    capability: result.control.capability,
    fact: { grade: gradePath(path, exitLatency), keys: keysFor(path), delay: usableDelay(path.delay, exitLatency) },
  }));

export interface Posture {
  /** "unrated": nothing to grade */
  grade: Grade | "unrated";
  red: boolean;
  provisional: boolean;
  controls: ControlResult[];
  byCapability: Map<Capability, Grade | null>;
  weakest: Map<Capability, Weakest>;
}

export function postureOf(protocol: Protocol): Posture {
  const controls = protocol.controls.map((control) => gradeControl(control, protocol.exitLatency ?? 0));
  const graded = controls.flatMap((result) => (result.grade ? [result.grade] : []));
  const allSettled = controls.length > 0 && controls.every((result) => result.grade === null);
  const byCapability = new Map<Capability, Grade | null>();
  controls.forEach((result) => {
    const sofar = byCapability.get(result.control.capability) ?? null;
    const next = result.grade === null ? sofar : sofar === null ? result.grade : worse(sofar, result.grade);
    byCapability.set(result.control.capability, next);
  });
  return {
    grade: graded.length ? worst(graded) : allSettled ? "A" : "unrated",
    red: controls.some((result) => result.red),
    provisional: controls.some((result) => result.provisional),
    controls,
    byCapability,
    weakest: weakestPaths(controls, protocol.exitLatency ?? 0),
  };
}

/** Where each capability's weakest path sits on the grid, as one number: its row plus its delay column. */
function cellsOf(posture: Posture): Map<Capability, number> {
  const cells = new Map<Capability, number>();
  posture.weakest.forEach((weakest, capability) => {
    cells.set(capability, Math.min(weakest.keys, 4) - 1 + columnFor(weakest.delay));
  });
  return cells;
}

// ───────────────────────────── walking the authority tree ─────────────────────────────

const childrenOf = (authority: Authority): Authority[] => {
  if (authority.kind === "multisig") {
    const members = authority.members.map((member) => member.who);
    const users = (authority.spendingLimits ?? []).flatMap((limit) => limit.users);
    return [...members, ...(authority.configAuthority ? [authority.configAuthority] : []), ...users];
  }
  if (authority.kind === "dao") {
    const holders = authority.holders.map((holder) => holder.who);
    const extra = [authority.realmAuthority, authority.councilMintAuthority, authority.pluginUpgradeAuthority];
    return [...holders, ...(authority.council?.members ?? []), ...extra.filter((x): x is Authority => !!x)];
  }
  return [];
};

const idOf = (authority: Authority) => ("id" in authority ? authority.id : "immutable");

/** Every authority reachable from the protocol's controls, once each (cycle safe). */
export function allAuthorities(protocol: Protocol): Authority[] {
  const seen = new Map<string, Authority>();
  const queue: Authority[] = protocol.controls.map((control) => control.by);
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(idOf(next))) continue;
    seen.set(idOf(next), next);
    queue.push(...childrenOf(next));
  }
  return [...seen.values()];
}

const multisigsOf = (protocol: Protocol) =>
  new Map(
    allAuthorities(protocol)
      .filter((authority): authority is Multisig => authority.kind === "multisig")
      .map((ms) => [ms.id, ms]),
  );

const memberIds = (ms: Multisig) => ms.members.map((member) => idOf(member.who));

/** Top-level identity of whoever controls a capability: changes when control moves to a different account. */
function fingerprint(protocol: Protocol, capability: Capability): string {
  const ids = protocol.controls.filter((control) => control.capability === capability).map((c) => idOf(c.by));
  return ids.sort().join(",");
}

function freshIn(protocol: Protocol, capability: Capability): { fresh: boolean; unknown: boolean } {
  const roots = protocol.controls.filter((control) => control.capability === capability).map((c) => c.by);
  const reachable = allAuthorities({ id: "", controls: roots.map((by) => ({ capability, label: "", by })) });
  return {
    fresh: reachable.some((authority) => authority.kind === "key" && !!authority.fresh),
    unknown: reachable.some((authority) => authority.kind === "unknown"),
  };
}

// ───────────────────────────── events ─────────────────────────────

export type Step = "prepare" | "control" | "arm" | "extract";

export interface Event {
  type: string;
  severity: Severity;
  at: number;
  step?: Step;
  capability?: Capability;
  detail: string;
  /** an extraction big enough to be an incident on its own */
  large?: boolean;
}

const sevIndex = (severity: Severity) => SEVERITIES.indexOf(severity);
export const raise = (severity: Severity, by = 1) =>
  SEVERITIES[Math.min(sevIndex(severity) + by, SEVERITIES.length - 1)]!;
export const lower = (severity: Severity, floor: Severity = "INFO") =>
  SEVERITIES[Math.max(sevIndex(severity) - 1, sevIndex(floor))]!;
export const atLeast = (severity: Severity, min: Severity) => sevIndex(severity) >= sevIndex(min);

export const severityFor = (grade: Grade): Severity =>
  grade === "F" ? "CRITICAL" : grade === "D" ? "HIGH" : grade === "C" ? "MEDIUM" : "LOW";

/** Field-level differences, used to explain an event. */
function structuralChanges(prev: Protocol, next: Protocol): string[] {
  const before = multisigsOf(prev);
  const after = [...multisigsOf(next).values()].filter((ms) => before.has(ms.id));
  return after.flatMap((ms) => describeMultisigChange(before.get(ms.id)!, ms));
}

function describeMultisigChange(a: Multisig, b: Multisig): string[] {
  const out: string[] = [];
  if (a.threshold !== b.threshold) out.push(`${b.id} threshold ${a.threshold} → ${b.threshold}`);
  if (a.timelock !== b.timelock) out.push(`${b.id} timelock ${a.timelock}s → ${b.timelock}s`);
  if (!!a.configAuthority !== !!b.configAuthority) out.push(`${b.id} config authority changed`);
  if ((a.spendingLimits ?? []).length !== (b.spendingLimits ?? []).length) out.push(`${b.id} spending limits changed`);
  if (memberIds(a).sort().join() !== memberIds(b).sort().join()) out.push(`${b.id} signers changed`);
  return out;
}

/** Signers removed from a multisig who can still use one of its spending limits (Squads keeps them on the list). */
function exSignersOnLimits(prev: Protocol, next: Protocol): string[] {
  const before = multisigsOf(prev);
  return [...multisigsOf(next).values()].flatMap((ms) => {
    const old = before.get(ms.id);
    if (!old) return [];
    const removed = memberIds(old).filter((id) => !memberIds(ms).includes(id));
    const users = (ms.spendingLimits ?? []).flatMap((limit) => limit.users.map(idOf));
    return removed.filter((id) => users.includes(id));
  });
}

function freshSignersAdded(prev: Protocol, next: Protocol): string[] {
  const before = multisigsOf(prev);
  return [...multisigsOf(next).values()].flatMap((ms) => {
    const old = before.get(ms.id);
    const oldIds = old ? memberIds(old) : [];
    return ms.members
      .map((member) => member.who)
      .filter((who) => who.kind === "key" && !!who.fresh && !oldIds.includes(who.id))
      .map(idOf);
  });
}

/** What changed between two states, graded by where each capability lands. */
export function diff(prev: Protocol, next: Protocol, at: number): Event[] {
  const before = postureOf(prev);
  const after = postureOf(next);
  const capabilities = [...new Set([...before.byCapability.keys(), ...after.byCapability.keys()])];
  const why = structuralChanges(prev, next).join("; ");
  const events = capabilities.flatMap((capability) => capabilityEvents(capability, prev, next, before, after, at, why));

  exSignersOnLimits(prev, next).forEach((id) =>
    events.push({
      type: "EX_SIGNER_ON_SPENDING_LIMIT",
      severity: "HIGH",
      at,
      step: "control",
      capability: "FUNDS",
      detail: `${id} was removed as a signer but can still use a spending limit`,
    }),
  );
  const freshSigners = freshSignersAdded(prev, next);
  if (freshSigners.length)
    events.push({
      type: "FRESH_SIGNERS_ADDED",
      severity: "MEDIUM",
      at,
      step: "prepare",
      detail: `new signers with no history: ${freshSigners.join(", ")}`,
    });
  return events;
}

function capabilityEvents(
  capability: Capability,
  prev: Protocol,
  next: Protocol,
  before: Posture,
  after: Posture,
  at: number,
  why: string,
): Event[] {
  const from = before.byCapability.get(capability) ?? null;
  const to = after.byCapability.get(capability) ?? null;
  const { fresh, unknown } = freshIn(next, capability);
  const moved = fingerprint(prev, capability) !== fingerprint(next, capability);
  const newness = (moved || why) && (fresh || unknown) ? (unknown ? 2 : 1) : 0;

  // handing control to something we cannot decode is never an improvement, whatever the provisional grade says
  if (moved && unknown) {
    const severity: Severity = isDrain(capability) ? "HIGH" : "MEDIUM";
    const detail = `${capability} moved to a controller Overwatch cannot decode`;
    return [{ type: "CONTROL_MOVED", severity, at, step: "control", capability, detail }];
  }

  if (to && (from === null || gradeGap(from, to) > 0)) {
    const severity = raise(severityFor(to), newness);
    const step = atLeast(severity, "HIGH") ? ("control" as const) : undefined;
    const detail = `${capability} ${from ?? "no path"} → ${to}${why ? ` (${why})` : ""}`;
    return [{ type: "WEAKENED", severity, at, step, capability, detail }];
  }
  if (from && (to === null || gradeGap(from, to) < 0)) {
    return [
      { type: "STRENGTHENED", severity: "INFO", at, capability, detail: `${capability} ${from} → ${to ?? "none"}` },
    ];
  }
  if (moved && to) {
    // same strength, different holder: routine unless the only key moved, or it moved somewhere new
    const base = lower(severityFor(to), "LOW");
    const severity = raise(base, newness);
    const step = atLeast(severity, "HIGH") ? ("control" as const) : undefined;
    return [{ type: "CONTROL_MOVED", severity, at, step, capability, detail: `${capability} moved to a new holder` }];
  }

  // same grade, but fewer keys or less time than before (2-of-2 → 1-of-1 is F → F and still worse)
  const was = before.weakest.get(capability);
  const now = after.weakest.get(capability);
  if (to && was && now && isWeaker(now, was)) {
    const severity = raise(lower(severityFor(to), "LOW"), newness);
    const step = atLeast(severity, "HIGH") ? ("control" as const) : undefined;
    const detail = `${capability} still ${to}, but ${now.keys} key(s) / ${now.delay}s (was ${was.keys} / ${was.delay}s)`;
    return [{ type: "WEAKENED", severity, at, step, capability, detail }];
  }
  return [];
}

// ───────────────────────────── signals and proposals ─────────────────────────────

export type Signal =
  | { type: "nonce_created" }
  | { type: "signer_funded_fresh" }
  | { type: "buffer_staged"; verified: boolean }
  | { type: "gov_deposit"; shareOfNeeded: number }
  | { type: "new_token" }
  | { type: "upgrade"; verified: boolean; staged: boolean }
  | { type: "oracle_switched"; to: "reputable" | "protocol_owned" | "unknown" }
  | { type: "oracle_divergence"; pct: number }
  | { type: "listing"; ageDays: number; singleKeyMint: boolean; protocolOracle: boolean; liquidityBelowCap: boolean }
  | { type: "param_loosened" }
  | { type: "outflow"; share: number; to: "new" | "bridge" | "protocol" | "known"; manyRecipients?: boolean }
  | { type: "supply_jump"; pct: number; matchedDeposits: boolean }
  | { type: "issuer_freeze" }
  | { type: "paused" }
  | { type: "announce"; hash: string };

export interface Proposal {
  id: string;
  kind: "config" | "vault" | "batch" | "dao";
  createdAt: number;
  /** approvals needed */
  threshold: number;
  approvals: { at: number; durableNonce?: boolean }[];
  /** when the threshold was reached */
  approvedAt?: number;
  timelock: number;
  /** a later config change made it stale */
  stale?: boolean;
  cancelled?: boolean;
  executed?: boolean;
  touches: Capability[];
  /** the protocol as it will be once this executes */
  after: Protocol;
  /** DAO only: voting power deposited in the 72h before, as a share of the votes needed */
  depositShareBefore?: number;
  /** share of the treasury the proposal moves (0 to 1); absent when it changes control rather than paying out */
  treasuryShare?: number;
  /** DAO only: the largest single holder's share of the votes needed (1 or more: can pass alone) */
  topHolderShare?: number;
  votingTime?: number;
  holdUp?: number;
  tipping?: "early" | "strict";
}

export interface Tick {
  /** block time, unix seconds */
  at: number;
  /** a new snapshot */
  state?: Protocol;
  /** states seen only in the transaction stream, between the previous snapshot and this one */
  transient?: Protocol[];
  signals?: Signal[];
  /** every live proposal (replaces the previous list) */
  proposals?: Proposal[];
  /** transaction signature: a replayed tick is ignored */
  txSig?: string;
  /** hash of the change that executed in this tick, for matching announcements */
  hash?: string;
}

function signalEvent(signal: Signal, at: number, posture: Posture | null): Event | null {
  const code = posture?.byCapability.get("CODE") ?? "A";
  switch (signal.type) {
    case "nonce_created": {
      const severity: Severity = posture?.red ? "CRITICAL" : "LOW";
      return {
        type: "SIGNER_NONCE_CREATED",
        severity,
        at,
        step: "prepare",
        detail: "a signer created a nonce account",
      };
    }
    case "signer_funded_fresh":
      return { type: "SIGNER_FUNDED_FRESH", severity: "LOW", at, step: "prepare", detail: "a signer got fresh funds" };
    case "buffer_staged":
      return signal.verified
        ? { type: "UPGRADE_STAGED", severity: "INFO", at, step: "prepare", detail: "staged code matches the build" }
        : { type: "UPGRADE_STAGED", severity: "MEDIUM", at, step: "prepare", detail: "staged code is unverified" };
    case "gov_deposit":
      return signal.shareOfNeeded >= 0.2
        ? { type: "GOVERNANCE_BUILDUP", severity: "MEDIUM", at, step: "prepare", detail: "voting power deposited" }
        : null;
    case "new_token":
      return { type: "NEW_TOKEN", severity: "INFO", at, step: "prepare", detail: "a new token or pool appeared" };
    case "upgrade": {
      const base = severityFor(code);
      const severity = raise(base, (signal.verified ? 0 : 1) + (signal.staged ? 0 : 1));
      return { type: "UPGRADE", severity, at, step: "arm", capability: "CODE", detail: `upgrade under CODE ${code}` };
    }
    case "oracle_switched": {
      const severity: Severity = signal.to === "reputable" ? "LOW" : "HIGH";
      return { type: "ORACLE_SWITCHED", severity, at, step: "arm", capability: "PRICE", detail: `to ${signal.to}` };
    }
    case "oracle_divergence":
      return signal.pct > 5
        ? { type: "ORACLE_DIVERGENCE", severity: "HIGH", at, step: "arm", detail: `${signal.pct}% apart` }
        : null;
    case "listing": {
      const flags = [signal.ageDays < 30, signal.singleKeyMint, signal.protocolOracle, signal.liquidityBelowCap];
      const count = flags.filter(Boolean).length;
      const severity: Severity = count === 0 ? "LOW" : count === 1 ? "MEDIUM" : "HIGH";
      return { type: "LISTING", severity, at, step: "arm", capability: "RISK", detail: `${count} warning sign(s)` };
    }
    case "param_loosened":
      return { type: "PARAM_LOOSENED", severity: "MEDIUM", at, step: "arm", capability: "RISK", detail: "looser risk" };
    case "outflow":
      return signal.manyRecipients ? null : outflowEvent(signal.share, signal.to, at);
    case "supply_jump":
      return supplyEvent(signal.pct, signal.matchedDeposits, at);
    case "issuer_freeze":
      return { type: "ISSUER_FREEZE", severity: "HIGH", at, detail: "a token issuer froze funds held by the protocol" };
    case "paused":
      return { type: "PAUSED", severity: "MEDIUM", at, detail: "the protocol was paused" };
    case "announce":
      return null;
  }
}

function outflowEvent(share: number, to: string, at: number): Event | null {
  if (to === "protocol" || to === "known" || share < 0.01) return null;
  const large = share >= 0.1;
  const severity: Severity = large ? "CRITICAL" : "HIGH";
  return { type: "OUTFLOW", severity, at, step: "extract", capability: "FUNDS", detail: `${share * 100}% out`, large };
}

function supplyEvent(pct: number, matched: boolean, at: number): Event | null {
  if (matched || pct < 5) return null;
  const large = pct >= 20;
  const severity: Severity = large ? "CRITICAL" : "HIGH";
  return { type: "SUPPLY_JUMP", severity, at, step: "extract", capability: "MINT", detail: `+${pct}% supply`, large };
}

// ───────────────────────────── the monitor ─────────────────────────────

export class Monitor {
  state: Protocol | null = null;
  posture: Posture | null = null;
  events: Event[] = [];
  now = 0;
  private steps: { step: Step; at: number }[] = [];
  private grades: { at: number; byCapability: Map<Capability, Grade | null>; cells: Map<Capability, number> }[] = [];
  private seenTx = new Set<string>();
  private announcements = new Map<string, number>();
  private warned = new Set<string>();
  private ratchetAlerted = new Set<string>();
  private sequenceRedAt: number | null = null;
  private approvedRed = false;

  get red(): boolean {
    return !!this.posture?.red || this.approvedRed || this.sequenceRed();
  }

  private sequenceRed(): boolean {
    if (this.sequenceRedAt === null) return false;
    const lastStep = Math.max(...this.steps.map((step) => step.at), this.sequenceRedAt);
    return this.now - lastStep < SEQUENCE_COOL_OFF || !!this.posture?.red;
  }

  tick(tick: Tick): Event[] {
    if (tick.txSig && this.seenTx.has(tick.txSig)) return [];
    if (tick.txSig) this.seenTx.add(tick.txSig);
    this.now = Math.max(this.now, tick.at);
    (tick.signals ?? []).forEach((signal) => {
      if (signal.type === "announce") this.announcements.set(signal.hash, tick.at);
    });

    const raw: Event[] = [];
    const states = [...(tick.transient ?? []), ...(tick.state ? [tick.state] : [])];
    states.forEach((state) => raw.push(...this.observe(state, tick.at)));
    const signals = (tick.signals ?? []).map((signal) => signalEvent(signal, tick.at, this.posture));
    raw.push(...signals.filter((event): event is Event => !!event));
    if (tick.proposals) raw.push(...this.reviewProposals(tick.proposals, tick.at));

    const final = this.announced(tick) ? raw.map(quieter) : raw;
    const escalations = final.flatMap((event) => this.escalate(event));
    const all = [...final, ...escalations];
    this.events.push(...all);
    return all;
  }

  /** The change in this tick matches an on-chain announcement posted at least 24h earlier. */
  private announced(tick: Tick): boolean {
    const postedAt = tick.hash ? this.announcements.get(tick.hash) : undefined;
    return postedAt !== undefined && tick.at - postedAt >= ANNOUNCE_LEAD;
  }

  /** A new state: diff it against the last one and track grade history. */
  private observe(state: Protocol, at: number): Event[] {
    const events = this.state ? diff(this.state, state, at) : [];
    this.state = state;
    this.posture = postureOf(state);
    this.grades.push({ at, byCapability: this.posture.byCapability, cells: cellsOf(this.posture) });
    return [...events, ...this.ratchet(at, events)];
  }

  /** Small step-downs that add up: compare against the strongest setup in the window. */
  private ratchet(at: number, events: Event[]): Event[] {
    const recent = this.grades.filter((entry) => at - entry.at <= RATCHET_WINDOW);
    const capabilities = [...this.posture!.byCapability.keys()];
    return capabilities.flatMap((capability) => {
      const current = this.posture!.byCapability.get(capability);
      const history = recent.flatMap((entry) => {
        const grade = entry.byCapability.get(capability);
        return grade ? [grade] : [];
      });
      if (!current || !history.length) return [];
      const best = history.reduce<Grade>((sofar, grade) => better(sofar, grade), "F");
      // cells lost on the grid: catches a delay cut from a week to nothing that only costs one grade
      const cellNow = recent.at(-1)?.cells.get(capability) ?? 0;
      const cellBest = Math.max(...recent.map((entry) => entry.cells.get(capability) ?? 0));
      const slid = gradeGap(best, current) >= RATCHET_STEPS || cellBest - cellNow >= RATCHET_STEPS;
      const alreadyLoud = events.some((e) => e.capability === capability && atLeast(e.severity, "HIGH"));
      const key = `${capability}:${current}`;
      if (!slid || alreadyLoud || this.ratchetAlerted.has(key)) return [];
      this.ratchetAlerted.add(key);
      const detail = `${capability} slid from ${best} to ${current} in small steps`;
      return [{ type: "RATCHET", severity: "HIGH" as const, at, step: "control" as const, capability, detail }];
    });
  }

  private reviewProposals(proposals: Proposal[], at: number): Event[] {
    const current = this.posture;
    const live = proposals.filter((p) => !p.executed && !p.cancelled && !(p.stale && p.kind === "config"));
    this.approvedRed = live.some((p) => p.approvedAt !== undefined && makesRed(current, postureOf(p.after)));
    return live.flatMap((proposal) => this.reviewProposal(proposal, current, at));
  }

  private once(id: string): boolean {
    if (this.warned.has(id)) return false;
    this.warned.add(id);
    return true;
  }

  private reviewProposal(p: Proposal, current: Posture | null, at: number): Event[] {
    const events: Event[] = [];
    const after = postureOf(p.after);
    const landing = worstLanding(current, after);
    const eta =
      p.kind === "dao"
        ? p.createdAt + (p.tipping === "early" ? 0 : (p.votingTime ?? 0)) + (p.holdUp ?? 0)
        : p.approvedAt !== undefined
          ? p.approvedAt + p.timelock
          : null;
    const when = eta === null ? "once approved" : `from ${eta}`;

    if (landing && this.once(`${p.id}:scheduled`))
      events.push({
        type: "SCHEDULED_WEAKENING",
        severity: severityFor(landing),
        at,
        detail: `proposal ${p.id} would lower the grade to ${landing}; can execute ${when}`,
      });

    if (p.approvedAt !== undefined && makesRed(current, after) && this.once(`${p.id}:approved`)) {
      const stays =
        p.kind === "vault" || p.kind === "batch" ? " Rotating signers will not stop it; cancel votes will." : "";
      events.push({
        type: "APPROVED_DANGEROUS",
        severity: "CRITICAL",
        at,
        step: "control",
        detail: `approved proposal ${p.id} would make the protocol red; can execute ${when}.${stays}`,
      });
    }

    const quick = p.approvals.filter((approval) => approval.at - p.createdAt <= PRESIGN_WINDOW).length;
    const presigned = quick >= p.threshold || p.approvals.some((approval) => approval.durableNonce);
    if (p.kind !== "dao" && presigned && this.once(`${p.id}:presigned`)) {
      const drains = p.touches.some(isDrain);
      events.push({
        type: "PRESIGNED_APPROVALS",
        severity: drains ? "CRITICAL" : "MEDIUM",
        at,
        step: drains ? "control" : undefined,
        detail: `proposal ${p.id} was approved by signatures that look prepared in advance`,
      });
    }

    if (p.kind === "dao" && p.touches.some(isDrain) && this.once(`${p.id}:dao`)) events.push(daoRisk(p, at));
    return events;
  }

  /** Takeover sequence: prepare → take control → arm → extract. */
  private escalate(event: Event): Event[] {
    if (!event.step) return [];
    const minimum: Record<Step, Severity> = { prepare: "LOW", control: "HIGH", arm: "MEDIUM", extract: "HIGH" };
    if (!atLeast(event.severity, minimum[event.step])) return [];
    this.steps.push({ step: event.step, at: event.at });
    const latest = (step: Step, window: number) =>
      this.steps.filter((s) => s.step === step && event.at - s.at >= 0 && event.at - s.at <= window).at(-1);

    const prepared = latest("prepare", PREPARE_TO_CONTROL);
    if (event.step === "control" && prepared && this.once(`setup:${prepared.at}`))
      return [{ type: "TAKEOVER_SETUP", severity: "HIGH", at: event.at, detail: "control taken after preparation" }];

    const controlled = latest("control", CONTROL_TO_ARM);
    if (event.step === "arm" && controlled) {
      this.sequenceRedAt = event.at;
      if (!this.once(`takeover:${controlled.at}`)) return [];
      return [{ type: "TAKEOVER", severity: "CRITICAL", at: event.at, detail: "control taken, then used" }];
    }

    const armed = latest("arm", ARM_TO_EXTRACT);
    if (event.step === "extract" && (event.large || armed)) {
      this.sequenceRedAt = event.at;
      if (!this.once(`incident:${Math.floor(event.at / HOUR)}`)) return [];
      return [{ type: "INCIDENT", severity: "CRITICAL", at: event.at, detail: "funds are leaving" }];
    }
    return [];
  }
}

/** One level quieter for a change that was announced ahead; a CRITICAL change never drops below HIGH. */
function quieter(event: Event): Event {
  if (event.type === "OUTFLOW")
    return { ...event, severity: "LOW", step: undefined, large: false, detail: `${event.detail} (announced)` };
  const isChange = event.type === "WEAKENED" || event.type === "UPGRADE" || event.type === "CONTROL_MOVED";
  if (!isChange) return event;
  const floor: Severity = event.severity === "CRITICAL" ? "HIGH" : "INFO";
  return { ...event, severity: lower(event.severity, floor), detail: `${event.detail} (announced)` };
}

/** Executing it would leave the protocol red, and it is not already red for the same reason. */
const makesRed = (current: Posture | null, after: Posture) =>
  after.red && (!current?.red || worstLanding(current, after) !== null);

function worstLanding(current: Posture | null, after: Posture): Grade | null {
  const changed = [...after.byCapability.entries()].filter(([capability, grade]) => {
    const now = current?.byCapability.get(capability) ?? null;
    return grade !== null && (now === null || gradeGap(now, grade) > 0);
  });
  const grades = changed.map(([, grade]) => grade!);
  return grades.length ? worst(grades) : null;
}

function daoRisk(p: Proposal, at: number): Event {
  const reasons: string[] = [];
  const routinePayment = p.touches.every((c) => c === "FUNDS") && (p.treasuryShare ?? 1) < 0.1;
  let bump = 0;
  if ((p.topHolderShare ?? 0) >= 1) {
    bump += 2;
    reasons.push("one holder can pass it alone");
  }
  if ((p.depositShareBefore ?? 0) >= 0.2) {
    bump += 2;
    reasons.push("voting power was deposited just before");
  }
  if (p.tipping === "early" && (p.holdUp ?? 0) === 0) {
    bump += 1;
    reasons.push("it can pass and execute instantly");
  }
  const severity = raise(routinePayment ? "LOW" : "HIGH", bump);
  const detail = `DAO proposal ${p.id} touches funds or code${reasons.length ? `: ${reasons.join(", ")}` : ""}`;
  return { type: "DAO_PROPOSAL_RISK", severity, at, step: atLeast(severity, "HIGH") ? "control" : undefined, detail };
}

// ───────────────────────────── keeping the monitor honest ─────────────────────────────

/** Red is published only when at least two providers agree and they are a majority of those asked. */
export function redPublishable(readings: boolean[]): boolean {
  const yes = readings.filter(Boolean).length;
  return yes >= 2 && yes * 2 > readings.length;
}

/** A grade moves only after two snapshots in a row agree on the new grade. */
export function smoothGrades(observed: Grade[]): Grade[] {
  const published: Grade[] = [];
  observed.forEach((grade, index) => {
    const current = published[index - 1] ?? grade;
    const confirmed = index > 0 && observed[index - 1] === grade;
    published.push(confirmed || index === 0 ? grade : current);
  });
  return published;
}

/** Critical alerts always go out first and are never dropped; everything else shares the budget. */
export function deliver(events: Event[], budget: number): Event[] {
  const critical = events.filter((event) => event.severity === "CRITICAL");
  const rest = events
    .filter((event) => event.severity !== "CRITICAL")
    .sort((a, b) => sevIndex(b.severity) - sevIndex(a.severity));
  return [...critical, ...rest.slice(0, Math.max(0, budget - critical.length))];
}

export const HEARTBEAT_LIMIT = 5 * MINUTE;
export const monitorSilent = (lastSuccess: number, now: number) => now - lastSuccess > HEARTBEAT_LIMIT;
