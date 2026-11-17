/**
 * Builders and checks for the scenario suite. Every check returns a list of failure messages; empty means it passed.
 */
import type {
  Authority,
  Capability,
  Control,
  Dao,
  Grade,
  Immutable,
  Key,
  Multisig,
  Protocol,
  Severity,
  Unknown,
} from "./model";
import { DAY, HOUR, MINUTE, SEVERITIES } from "./model";
import type { Event, Proposal, Step, Tick } from "./engine";
import { Monitor, postureOf } from "./engine";

// ───────────────────────────── builders ─────────────────────────────

export const key = (id: string, extra: Partial<Omit<Key, "kind" | "id">> = {}): Key => ({ kind: "key", id, ...extra });

export const keys = (prefix: string, count: number, extra: Partial<Omit<Key, "kind" | "id">> = {}): Key[] =>
  Array.from({ length: count }, (_, index) => key(`${prefix}${index + 1}`, extra));

export const multisig = (
  id: string,
  threshold: number,
  members: Authority[],
  timelock: number,
  extra: Partial<Multisig> = {},
): Multisig => ({ kind: "multisig", id, threshold, members: members.map((who) => ({ who })), timelock, ...extra });

export const control = (capability: Capability, by: Authority, extra: Partial<Control> = {}): Control => ({
  capability,
  label: `${capability} control`,
  by,
  ...extra,
});

export const protocol = (id: string, controls: Control[], extra: Partial<Protocol> = {}): Protocol => ({
  id,
  controls,
  ...extra,
});

export const unknown = (id: string): Unknown => ({ kind: "unknown", id });
export const immutable: Immutable = { kind: "immutable" };

/** The usual Solana setup: one Squads vault holds both the upgrade authority and the funds. */
export const vaultProtocol = (id: string, by: Authority, extra: Partial<Protocol> = {}) =>
  protocol(id, [control("CODE", by), control("FUNDS", by)], extra);

/** k-of-n Squads multisig with fresh signer names, as a protocol. */
export const squads = (id: string, threshold: number, count: number, timelock: number, extra: Partial<Multisig> = {}) =>
  vaultProtocol(id, multisig(`${id}-ms`, threshold, keys(`${id}-s`, count), timelock, extra));

export const dao = (id: string, holders: [Authority, number][], extra: Partial<Dao> = {}): Dao => ({
  kind: "dao",
  id,
  holders: holders.map(([who, share]) => ({ who, share })),
  passShare: 0.5,
  votingTime: 3 * DAY,
  holdUp: 1 * DAY,
  tipping: "strict",
  veto: false,
  ...extra,
});

/** A point in time: day 0 is the start of every scenario. */
export const T0 = 1_774_000_000;
export const at = (days: number, hours = 0, minutes = 0, seconds = 0) =>
  T0 + days * DAY + hours * HOUR + minutes * MINUTE + seconds;

export const proposal = (extra: Partial<Proposal> & Pick<Proposal, "id" | "after">): Proposal => ({
  kind: "vault",
  createdAt: T0,
  threshold: 3,
  approvals: [],
  timelock: 0,
  touches: ["CODE"],
  ...extra,
});

// ───────────────────────────── checks ─────────────────────────────

interface PostureWant {
  grade?: Grade | "unrated" | "unverified";
  red?: boolean;
  provisional?: boolean;
  capability?: Partial<Record<Capability, Grade | null>>;
  /** substring of one of the reasons */
  reason?: string;
}

export function expectPosture(subject: Protocol, want: PostureWant): string[] {
  const posture = postureOf(subject);
  const failures: string[] = [];
  if (want.grade !== undefined && posture.grade !== want.grade)
    failures.push(`grade ${posture.grade}, expected ${want.grade}`);
  if (want.red !== undefined && posture.red !== want.red) failures.push(`red ${posture.red}, expected ${want.red}`);
  if (want.provisional !== undefined && posture.provisional !== want.provisional)
    failures.push(`provisional ${posture.provisional}, expected ${want.provisional}`);
  Object.entries(want.capability ?? {}).forEach(([capability, grade]) => {
    const actual = posture.byCapability.get(capability as Capability) ?? null;
    if (actual !== grade) failures.push(`${capability} ${actual}, expected ${grade}`);
  });
  const reasons = posture.controls.flatMap((result) => result.reasons);
  if (want.reason && !reasons.some((reason) => reason.includes(want.reason!)))
    failures.push(`no reason containing "${want.reason}" (got: ${reasons.join(" | ") || "none"})`);
  return failures;
}

export interface EventWant {
  type: string;
  severity?: Severity;
  /** at least this severe */
  min?: Severity;
  step?: Step;
  capability?: Capability;
}

const sevRank = (severity: Severity) => SEVERITIES.indexOf(severity);

const matches = (event: Event, want: EventWant) =>
  event.type === want.type &&
  (want.severity === undefined || event.severity === want.severity) &&
  (want.min === undefined || sevRank(event.severity) >= sevRank(want.min)) &&
  (want.step === undefined || event.step === want.step) &&
  (want.capability === undefined || event.capability === want.capability);

const describe = (want: EventWant) =>
  [want.type, want.severity, want.min && `≥${want.min}`, want.step, want.capability].filter(Boolean).join(" ");

const summary = (events: Event[]) => events.map((e) => `${e.type}:${e.severity}`).join(", ") || "none";

interface EventsWant {
  has?: EventWant[];
  lacks?: EventWant[];
  /** nothing louder than this */
  max?: Severity;
}

export function expectEvents(events: Event[], want: EventsWant): string[] {
  const missing = (want.has ?? []).filter((w) => !events.some((event) => matches(event, w)));
  const unwanted = (want.lacks ?? []).filter((w) => events.some((event) => matches(event, w)));
  const loud = want.max ? events.filter((event) => sevRank(event.severity) > sevRank(want.max!)) : [];
  return [
    ...missing.map((w) => `missing ${describe(w)} (got: ${summary(events)})`),
    ...unwanted.map((w) => `unexpected ${describe(w)} (got: ${summary(events)})`),
    ...(loud.length ? [`louder than ${want.max}: ${summary(loud)}`] : []),
  ];
}

/** Run a timeline and keep, for each tick, whether the protocol was red right after it. */
export function replay(ticks: Tick[]): { monitor: Monitor; redAfter: boolean[] } {
  const monitor = new Monitor();
  const redAfter = ticks.map((tick) => {
    monitor.tick(tick);
    return monitor.red;
  });
  return { monitor, redAfter };
}

export const expectTrue = (value: boolean, message: string): string[] => (value ? [] : [message]);
