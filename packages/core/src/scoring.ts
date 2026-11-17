/**
 * Production grading: the v4 ruleset (ruleset/engine.ts, tested by lab/rules-v4) applied to a live snapshot.
 *
 * The grade is the engine's: every way to drain the protocol is graded on "keys to steal" × "usable delay", and the
 * protocol takes its worst. Red means a fund-draining power grades F. Everything else (nonce accounts, pending
 * proposals, recent weakening, risky collateral) is reported as a flag and never moves the grade.
 */
import type { ControlSnapshot, OverwatchEvent } from "./types";
import { SEVERITY_ORDER } from "./types";
import { actionWeakens } from "./rules";
import { postureOf, isDrain, type ControlResult, type Posture } from "./ruleset/engine";
import { protocolFromSnapshot, type GradeContext } from "./ruleset/snapshot";
import type { Capability } from "./ruleset/model";

/** The ruleset version stored with every score, so grade changes are only compared within one ruleset. */
export const RULESET_VERSION = "v4.1";

/**
 * Flags bitmap (u64) published onchain. Bit positions are part of the public API and the deployed registry
 * program checks `flags & RED_MASK`, so the red bits (0 and 10) keep their positions and now mean exactly the
 * ruleset's red. Bits 4 and 11 belonged to the old red rule and are no longer set.
 */
export const FLAG = {
  /** one private key can drain the protocol with no protective delay (that path grades F) */
  SINGLE_KEY: 1n << 0n,
  /** a multisig on a drain path applies approved changes with no delay */
  NO_TIMELOCK: 1n << 1n,
  /** a multisig on a drain path needs two signatures or fewer */
  LOW_THRESHOLD: 1n << 2n,
  /** a multisig has a config authority that changes it without a vote */
  CONTROLLED_MULTISIG: 1n << 3n,
  /** retired: was SIGNER_NONCE under the old red rule; see SIGNER_NONCE (bit 12) */
  RETIRED_4: 1n << 4n,
  PENDING_WEAKENING: 1n << 5n,
  RECENT_WEAKENING: 1n << 6n,
  RISKY_COLLATERAL: 1n << 7n,
  DEPRECATED_ORACLE: 1n << 8n,
  /** part of the control path could not be read: the grade is provisional */
  UNVERIFIED: 1n << 9n,
  /** a fund-draining power grades F: this is what red means */
  DRAIN_PATH_F: 1n << 10n,
  /** retired: was RECENT_CRITICAL under the old red rule; see RECENT_CRITICAL (bit 13) */
  RETIRED_11: 1n << 11n,
  /** a signer holds a durable nonce account (pre-signed transactions that never expire) */
  SIGNER_NONCE: 1n << 12n,
  /** a CRITICAL weakening happened in the last 30 days */
  RECENT_CRITICAL: 1n << 13n,
  /** a drain capability this kind of protocol has is not mapped yet */
  PARTIAL_COVERAGE: 1n << 14n,
} as const;

/** Unchanged bit positions (0, 4, 10, 11) so the deployed registry and SDK keep working. Only 0 and 10 are set now. */
export const RED_MASK = FLAG.SINGLE_KEY | FLAG.RETIRED_4 | FLAG.DRAIN_PATH_F | FLAG.RETIRED_11;
export const isRed = (flags: bigint) => (flags & RED_MASK) !== 0n;

export type Grade = "A" | "B" | "C" | "D" | "F";

/** One line of explanation. `points` is kept for API compatibility and is always 0 under the grid ruleset. */
export interface Deduction {
  key: string;
  points: number;
  reason: string;
}

/** How one control was graded: the line a protocol page shows. */
export interface CapabilityGrade {
  capability: Capability;
  label: string;
  /** null: nobody can do it, a trust assumption, a power that can only make things safer, or (with provisional) unread */
  grade: Grade | null;
  /** private keys an attacker must steal on the cheapest path */
  keys: number | null;
  /** seconds between approval and effect on that path */
  delaySec: number | null;
  provisional: boolean;
  red: boolean;
  reasons: string[];
}

export interface ScoreResult {
  /** 0-100, derived from the grade (for sorting and the onchain record) */
  score: number;
  /** "?": unverified, a drain power runs through something Overwatch cannot read */
  grade: Grade | "?";
  flags: bigint;
  breakdown: Deduction[];
  red: boolean;
  provisional: boolean;
  /** drain capabilities expected for this kind of protocol that are not mapped yet */
  uncovered: Capability[];
  capabilities: CapabilityGrade[];
  ruleset: string;
}

/** One score per grade, so the 0-100 number and the letter can never disagree. */
const GRADE_SCORE: Record<Grade, number> = { A: 95, B: 80, C: 65, D: 50, F: 20 };
export const gradeFor = (s: number): Grade => (s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F");

const DAY = 86_400_000;
type RecentEvent = Pick<OverwatchEvent, "severity" | "weakening" | "blockTime" | "detectedAt" | "title">;

/** The cheapest path of one graded control, as plain numbers. */
function cheapest(result: ControlResult): { keys: number | null; delaySec: number | null } {
  if (!result.paths.length) return { keys: null, delaySec: null };
  const sorted = [...result.paths].sort((a, b) => a.holders.length - b.holders.length || a.delay - b.delay);
  const path = sorted[0]!;
  return { keys: Math.max(1, path.holders.length), delaySec: path.delay };
}

/** A provisional control is held at C inside the engine; publicly it has no letter unless what is known is worse. */
const shownGrade = (result: ControlResult): Grade | null =>
  result.provisional && result.grade && !["D", "F"].includes(result.grade) ? null : result.grade;

function capabilityGrades(posture: Posture): CapabilityGrade[] {
  return posture.controls.map((result) => ({
    capability: result.control.capability,
    label: result.control.label,
    grade: shownGrade(result),
    ...cheapest(result),
    provisional: result.provisional,
    red: result.red,
    reasons: result.reasons,
  }));
}

/** Facts about the multisigs that sit on a drain path. */
function multisigFlags(snapshot: ControlSnapshot): bigint {
  let flags = 0n;
  const onDrainPath = snapshot.multisigs.filter((ms) => ms.role !== "treasury");
  if (onDrainPath.some((ms) => ms.timeLockSec === 0)) flags |= FLAG.NO_TIMELOCK;
  if (onDrainPath.some((ms) => ms.threshold <= 2)) flags |= FLAG.LOW_THRESHOLD;
  if (snapshot.multisigs.some((ms) => ms.configAuthority)) flags |= FLAG.CONTROLLED_MULTISIG;
  const pendingWeakens = snapshot.multisigs.some((ms) =>
    ms.pending.some((proposal) => proposal.actions.some((action) => actionWeakens(ms, action))),
  );
  if (pendingWeakens) flags |= FLAG.PENDING_WEAKENING;
  return flags;
}

function recentFlags(recentEvents: RecentEvent[], now: string): { flags: bigint; recent: RecentEvent[] } {
  const t = Date.parse(now);
  const recent = recentEvents.filter(
    (e) =>
      e.weakening &&
      SEVERITY_ORDER[e.severity] >= SEVERITY_ORDER.HIGH &&
      t - Date.parse(e.blockTime ?? e.detectedAt) <= 30 * DAY,
  );
  let flags = recent.length ? FLAG.RECENT_WEAKENING : 0n;
  if (recent.some((e) => e.severity === "CRITICAL")) flags |= FLAG.RECENT_CRITICAL;
  return { flags, recent };
}

export function scoreSnapshot(
  s: ControlSnapshot,
  recentEvents: RecentEvent[],
  now = new Date().toISOString(),
  context: GradeContext = {},
): ScoreResult {
  const posture = postureOf(protocolFromSnapshot(s, context));
  const capabilities = capabilityGrades(posture);
  const grade: Grade | "?" = posture.grade === "unrated" ? "F" : posture.grade === "unverified" ? "?" : posture.grade;
  const breakdown: Deduction[] = [];
  const note = (key: string, reason: string) => breakdown.push({ key, points: 0, reason });
  let flags = multisigFlags(s);

  // what sets the grade: the worst drain control first
  capabilities
    .filter((c) => c.grade !== null || c.provisional)
    .sort((a, b) => (a.grade ? GRADE_SCORE[a.grade] : 65) - (b.grade ? GRADE_SCORE[b.grade] : 65))
    .forEach((c) => note(`grade_${c.capability.toLowerCase()}`, describeControl(c)));

  // kept in step with red: one key behind a long enough timelock is graded, not red, so it must not set a red bit
  const drainKeys = capabilities.filter((c) => isDrain(c.capability) && c.red && c.keys === 1);
  if (drainKeys.length) flags |= FLAG.SINGLE_KEY;
  if (posture.red) flags |= FLAG.DRAIN_PATH_F;
  if (posture.provisional || !s.verified) {
    flags |= FLAG.UNVERIFIED;
    note(
      "provisional",
      posture.grade === "unverified"
        ? "Part of the control path could not be read, so no grade is published. Teams can show us their governance to get one."
        : "Part of the control path could not be read; what could be read already sets this grade, and the rest can only lower it.",
    );
  }
  if (posture.grade === "unrated") note("unrated", "Nothing that controls this protocol could be read.");
  if (posture.uncovered.length) {
    flags |= FLAG.PARTIAL_COVERAGE;
    note(
      "partial_coverage",
      `Not mapped yet: ${posture.uncovered.join(", ")}. The grade covers what is mapped and cannot be an A until the rest is.`,
    );
  }

  const signers = new Set(s.multisigs.flatMap((m) => m.members.map((x) => x.key)));
  const nonceSigners = new Set(s.nonces.filter((n) => signers.has(n.authority)).map((n) => n.authority));
  if (nonceSigners.size) {
    flags |= FLAG.SIGNER_NONCE;
    note(
      "flag_signer_nonce",
      `${nonceSigners.size} signer(s) hold durable nonce accounts. Shown as a flag; the timelock is the defence.`,
    );
  }
  if (flags & FLAG.PENDING_WEAKENING) note("flag_pending", "A pending proposal would weaken controls.");

  const { flags: recentBits, recent } = recentFlags(recentEvents, now);
  flags |= recentBits;
  if (recent.length) note("flag_recent", `Controls were weakened in the last 30 days: ${recent[0]!.title}.`);

  const risky = s.mints.filter((m) => m.permanentDelegate).length;
  const deprecated = s.oracles.filter((o) => o.deprecated).length;
  if (risky) {
    flags |= FLAG.RISKY_COLLATERAL;
    note("flag_collateral", `${risky} collateral token(s) have a permanent delegate that can move anyone's balance.`);
  }
  if (deprecated) {
    flags |= FLAG.DEPRECATED_ORACLE;
    note("flag_oracle", `${deprecated} deprecated oracle(s) in use.`);
  }

  return {
    // the onchain record has no unverified grade: it is published as C with the UNVERIFIED flag, as before v4.1
    score: posture.grade === "unrated" ? 0 : GRADE_SCORE[grade === "?" ? "C" : grade],
    grade,
    flags,
    breakdown,
    red: posture.red,
    provisional: posture.provisional,
    uncovered: posture.uncovered,
    capabilities,
    ruleset: RULESET_VERSION,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Upgrade Main program: 4 keys, 1h delay → C" in words a depositor can read. */
export function describeControl(c: CapabilityGrade): string {
  const delay = c.delaySec === null ? "" : c.delaySec === 0 ? "no delay" : `${fmtDelay(c.delaySec)} delay`;
  const keys = c.keys === null ? "" : `${plural(c.keys, "key")} to steal`;
  const path = [keys, delay].filter(Boolean).join(", ");
  if (c.provisional && !c.grade) return `${c.label}: runs through a controller Overwatch cannot read yet → unverified.`;
  return `${c.label}: ${path || "no one can do this"} → ${c.grade}${c.provisional ? " (provisional)" : ""}.`;
}

function fmtDelay(sec: number): string {
  if (sec >= 86_400) return `${Math.round((sec / 86_400) * 10) / 10}d`;
  if (sec >= 3_600) return `${Math.round((sec / 3_600) * 10) / 10}h`;
  return `${Math.round(sec / 60)}m`;
}

export const flagNames = (flags: bigint) =>
  Object.entries(FLAG)
    .filter(([name, b]) => !name.startsWith("RETIRED") && (flags & b) !== 0n)
    .map(([k]) => k);
