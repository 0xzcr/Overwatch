import type { ControlSnapshot, OverwatchEvent } from "./types";
import { SEVERITY_ORDER } from "./types";
import { actionWeakens } from "./rules";

/** Flags bitmap (u64) published onchain. Bit positions are part of the public API. */
export const FLAG = {
  SINGLE_KEY: 1n << 0n,
  NO_TIMELOCK: 1n << 1n,
  LOW_THRESHOLD: 1n << 2n,
  CONTROLLED_MULTISIG: 1n << 3n,
  SIGNER_NONCE: 1n << 4n,
  PENDING_WEAKENING: 1n << 5n,
  RECENT_WEAKENING: 1n << 6n,
  RISKY_COLLATERAL: 1n << 7n,
  DEPRECATED_ORACLE: 1n << 8n,
  UNVERIFIED: 1n << 9n,
  /** derived: NO_TIMELOCK and LOW_THRESHOLD on the same multisig */
  NO_TIMELOCK_LOW_THRESHOLD: 1n << 10n,
  /** derived: RECENT_WEAKENING where at least one event was CRITICAL */
  RECENT_CRITICAL: 1n << 11n,
} as const;

/**
 * RED_MASK: any of these bits ⇒ "red" (vaults should exit).
 *   bit 0  SINGLE_KEY
 *   bit 10 NO_TIMELOCK only when combined with LOW_THRESHOLD (bit 1 & bit 2 on the same multisig)
 *   bit 4  SIGNER_NONCE
 *   bit 11 RECENT_WEAKENING when the event was CRITICAL
 * Derived bits 10/11 make the rule a plain mask, so onchain programs can check `flags & RED_MASK != 0`.
 */
export const RED_MASK = FLAG.SINGLE_KEY | FLAG.NO_TIMELOCK_LOW_THRESHOLD | FLAG.SIGNER_NONCE | FLAG.RECENT_CRITICAL;
export const isRed = (flags: bigint) => (flags & RED_MASK) !== 0n;

export type Grade = "A" | "B" | "C" | "D" | "F";
export interface Deduction { key: string; points: number; reason: string }
export interface ScoreResult { score: number; grade: Grade; flags: bigint; breakdown: Deduction[]; red: boolean }

export const gradeFor = (s: number): Grade => (s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F");
const DAY = 86_400_000;

export function scoreSnapshot(s: ControlSnapshot, recentEvents: Pick<OverwatchEvent, "severity" | "weakening" | "blockTime" | "detectedAt" | "title">[], now = new Date().toISOString()): ScoreResult {
  const d: Deduction[] = [];
  let flags = 0n;
  const add = (key: string, points: number, reason: string) => d.push({ key, points, reason });

  const upgradeable = s.programs.filter((p) => p.authorityKind !== "IMMUTABLE");
  const allImmutable = s.programs.length > 0 && upgradeable.length === 0;

  if (s.programs.some((p) => p.authorityKind === "SINGLE_KEY")) {
    flags |= FLAG.SINGLE_KEY;
    add("single_key", 60, "A program can be upgraded by one private key.");
  }

  // Multisig deductions: worst multisig that actually controls something upgradeable or admin.
  const relevant = s.multisigs.filter((m) => !(allImmutable && m.role === "upgrade_authority"));
  if (relevant.some((m) => m.configAuthority)) {
    flags |= FLAG.CONTROLLED_MULTISIG;
    add("controlled_multisig", 20, "A single config authority can change the multisig without a vote.");
  }
  if (relevant.length) {
    const minT = Math.min(...relevant.map((m) => m.threshold));
    const minRatio = Math.min(...relevant.map((m) => m.threshold / Math.max(1, m.members.filter((x) => (x.permissions & 2) !== 0).length)));
    if (minT <= 2) {
      flags |= FLAG.LOW_THRESHOLD;
      add("threshold_le_2", 20, `Only ${minT} signature(s) are needed to approve changes.`);
    } else if (minRatio < 0.5) {
      add("threshold_ratio", 10, `Less than half of the signers are needed (${(minRatio * 100).toFixed(0)}%).`);
    }
    const minTl = Math.min(...relevant.map((m) => m.timeLockSec));
    if (minTl === 0) {
      flags |= FLAG.NO_TIMELOCK;
      add("timelock_zero", 25, "Approved changes take effect immediately (no timelock).");
    } else if (minTl < 86400) add("timelock_lt_24h", 15, "Timelock is shorter than 24 hours.");
    else if (minTl < 172800) add("timelock_lt_48h", 5, "Timelock is shorter than 48 hours.");
    if (relevant.some((m) => m.timeLockSec === 0 && m.threshold <= 2)) flags |= FLAG.NO_TIMELOCK_LOW_THRESHOLD;
  }

  const signers = new Set(s.multisigs.flatMap((m) => m.members.map((x) => x.key)));
  const nonceSigners = new Set(s.nonces.filter((n) => signers.has(n.authority)).map((n) => n.authority));
  if (nonceSigners.size) {
    flags |= FLAG.SIGNER_NONCE;
    add("signer_nonce", Math.min(30, nonceSigners.size * 10), `${nonceSigners.size} signer(s) hold durable nonce accounts (pre-signed transactions that never expire).`);
  }

  if (s.multisigs.some((m) => m.pending.some((p) => p.actions.some((a) => actionWeakens(m, a))))) {
    flags |= FLAG.PENDING_WEAKENING;
    add("pending_weakening", 10, "A pending proposal would weaken controls.");
  }

  const t = Date.parse(now);
  const recent = recentEvents.filter((e) => e.weakening && SEVERITY_ORDER[e.severity] >= SEVERITY_ORDER.HIGH && t - Date.parse(e.blockTime ?? e.detectedAt) <= 30 * DAY);
  if (recent.length) {
    flags |= FLAG.RECENT_WEAKENING;
    if (recent.some((e) => e.severity === "CRITICAL")) flags |= FLAG.RECENT_CRITICAL;
    add("recent_weakening", 10, `Controls were weakened in the last 30 days: ${recent[0]!.title}.`);
  }

  const risky = s.mints.filter((m) => m.permanentDelegate).length;
  const dep = s.oracles.filter((o) => o.deprecated).length;
  if (risky) flags |= FLAG.RISKY_COLLATERAL;
  if (dep) flags |= FLAG.DEPRECATED_ORACLE;
  const coll = Math.min(20, (risky + dep) * 10);
  if (coll) add("collateral_oracle", coll, `${risky} collateral token(s) with PermanentDelegate, ${dep} deprecated oracle(s).`);

  // Control we cannot attribute (unmapped PDA, unknown, or governance we don't decode yet) is not "safe" — it's unknown.
  const unmapped = s.programs.filter((p) => ["OTHER_PROGRAM_PDA", "UNKNOWN", "SQUADS_V3", "REALMS_GOVERNANCE"].includes(p.authorityKind) || (p.authorityKind === "SQUADS_V4_VAULT" && !s.multisigs.some((m) => m.address === p.multisig)));
  if (unmapped.length) {
    flags |= FLAG.UNVERIFIED;
    add("unmapped_control", 15, `Overwatch could not fully map who controls ${unmapped.length} program(s) (${[...new Set(unmapped.map((p) => p.authorityKind))].join(", ")}). Unknown is not the same as safe.`);
  }
  if (!s.verified) flags |= FLAG.UNVERIFIED;

  const score = Math.max(0, Math.min(100, 100 - d.reduce((n, x) => n + x.points, 0)));
  return { score, grade: gradeFor(score), flags, breakdown: d, red: isRed(flags) };
}

export const flagNames = (flags: bigint) => Object.entries(FLAG).filter(([, b]) => (flags & b) !== 0n).map(([k]) => k);
