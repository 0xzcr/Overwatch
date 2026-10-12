import { diffSnapshots } from "./rules";
import { flagNames, scoreSnapshot } from "./scoring";
import type { ControlSnapshot, OverwatchEvent } from "./types";

/**
 * Rehearsal of the devnet demo, for deployments without devnet keys and for offline pipeline checks.
 * Each action edits a model of the demo protocol's controls (the same starting point `pnpm demo:setup` creates:
 * a 2-of-3 Squads v4 vault with a 2-day timelock that holds the upgrade authority, config authority = demo admin)
 * and runs it through the real rules engine and scoring. No transaction is sent.
 */

export const REHEARSAL_ACTIONS = ["remove-timelock", "lower-threshold", "create-signer-nonce", "transfer-authority", "reset"] as const;
export type RehearsalAction = (typeof REHEARSAL_ACTIONS)[number];
export const isRehearsalAction = (a: string): a is RehearsalAction => (REHEARSAL_ACTIONS as readonly string[]).includes(a);

export interface DemoModel {
  timeLock: number;
  threshold: number;
  nonce: boolean;
  singleKey: boolean;
}
export const DEMO_BASELINE: DemoModel = { timeLock: 172_800, threshold: 2, nonce: false, singleKey: false };

const PROGRAM = "demo-protocol";
const MULTISIG = "demo-multisig";
const VAULT = "demo-multisig-vault";
const ADMIN = "demo-admin";
const SIGNERS = ["signer-a", "signer-b", "signer-c"];
export const DEMO_NAME = "Overwatch Demo Protocol";
// The rules engine shortens addresses ("sign…er-a"). These are names, not addresses, so spell them out again.
const NAMES = [PROGRAM, MULTISIG, VAULT, ADMIN, "demo-nonce", ...SIGNERS];
const readable = (s: string) => NAMES.reduce((t, n) => t.replaceAll(`${n.slice(0, 4)}…${n.slice(-4)}`, n), s);

/** Funds the demo vault allocates to the demo strategy, in demo USDC (6 decimals). */
const ALLOCATED = 1_000_000_000;

/** The demo protocol's controls as a snapshot the rules engine can diff. */
export function demoSnapshot(m: DemoModel, at: string): ControlSnapshot {
  return {
    protocol: "overwatch-demo",
    slot: 0,
    takenAt: at,
    programs: [
      {
        programId: PROGRAM,
        label: "demo program",
        programDataAddress: `${PROGRAM}-data`,
        lastDeploySlot: 0,
        upgradeAuthority: m.singleKey ? ADMIN : VAULT,
        authorityKind: m.singleKey ? "SINGLE_KEY" : "SQUADS_V4_VAULT",
        authorityOwner: null,
        multisig: m.singleKey ? null : MULTISIG,
      },
    ],
    multisigs: [
      {
        address: MULTISIG,
        version: "v4",
        vaultIndex: 0,
        role: "upgrade_authority",
        threshold: m.threshold,
        members: SIGNERS.map((key) => ({ key, permissions: 7 })),
        timeLockSec: m.timeLock,
        configAuthority: ADMIN,
        transactionIndex: 0,
        staleTransactionIndex: 0,
        pending: [],
      },
    ],
    nonces: m.nonce ? [{ address: "demo-nonce", authority: SIGNERS[0]!, blockhash: "rehearsal" }] : [],
    mints: [],
    oracles: [],
    admin: [],
    verified: true,
  };
}

/** What the real devnet action would log, and how it changes the model. */
export function applyDemoAction(m: DemoModel, a: RehearsalAction): { next: DemoModel; log: string[] } {
  switch (a) {
    case "remove-timelock":
      return { next: { ...m, timeLock: 0 }, log: [`multisig_config_set_time_lock ${m.timeLock}s → 0s (config authority signs, executes instantly)`] };
    case "lower-threshold":
      return { next: { ...m, threshold: 1 }, log: [`multisig_change_threshold ${m.threshold} → 1`] };
    case "create-signer-nonce":
      return { next: { ...m, nonce: true }, log: ["create durable nonce account, authority = signer-a"] };
    case "transfer-authority": {
      const log: string[] = [];
      if (m.timeLock > 0) log.push("multisig has a timelock, so a vault transaction can't execute yet. Removing it first (this is itself an alert).", "multisig_config_set_time_lock → 0s");
      log.push("vault_transaction_create: BPF loader SetAuthority → demo admin key", "proposal approved by 2 signers, executed");
      return { next: { ...m, timeLock: 0, singleKey: true }, log };
    }
    case "reset":
      return { next: DEMO_BASELINE, log: ["restore 2-of-3, 2-day timelock, close nonce accounts, upgrade authority back to the multisig vault", "keeper re-arms the vault position"] };
  }
}

export interface RehearsalResult {
  log: string[];
  events: { severity: string; title: string; explanation: string; labels: string[] }[];
  registry: { score: number; grade: string; red: boolean; flags: string[]; version: number };
  shield: "fired" | "rearmed" | null;
  state: {
    multisig: { threshold: number; members: number; timeLock: number };
    authorityIsVault: boolean;
    risk: { score: number; grade: string; red: boolean; version: number };
    position: { shielded: boolean; allocated: string };
  };
}

/**
 * Replays `done` from the baseline to rebuild state and history (stateless, so it works on serverless hosts),
 * then applies `action`.
 */
export function rehearse(done: RehearsalAction[], action: RehearsalAction): RehearsalResult {
  let m = DEMO_BASELINE;
  let shielded = false;
  let version = 1;
  const history: OverwatchEvent[] = [];
  const t0 = Date.now() - (done.length + 1) * 60_000;
  let last: Omit<RehearsalResult, "state"> | null = null;

  for (const [i, a] of [...done, action].entries()) {
    const at = new Date(t0 + i * 60_000).toISOString();
    const { next, log } = applyDemoAction(m, a);
    const events = a === "reset" ? [] : diffSnapshots(demoSnapshot(m, at), demoSnapshot(next, at), { history, slot: i + 1, blockTime: at, now: at, name: DEMO_NAME });
    if (a === "reset") history.length = 0;
    history.push(...events);
    m = next;
    const sc = scoreSnapshot(demoSnapshot(m, at), history, at);
    version += 1;
    let shield: RehearsalResult["shield"] = null;
    if (sc.red && !shielded) {
      shielded = true;
      shield = "fired";
    } else if (a === "reset" && shielded) {
      shielded = false;
      shield = "rearmed";
    }
    last = {
      log,
      events: events.map((e) => ({ severity: e.severity, title: readable(e.title), explanation: readable(e.explanation), labels: e.labels ?? [] })),
      registry: { score: sc.score, grade: sc.grade, red: sc.red, flags: flagNames(sc.flags), version },
      shield,
    };
  }

  const r = last!;
  return {
    ...r,
    state: {
      multisig: { threshold: m.threshold, members: SIGNERS.length, timeLock: m.timeLock },
      authorityIsVault: !m.singleKey,
      risk: { score: r.registry.score, grade: r.registry.grade, red: r.registry.red, version: r.registry.version },
      position: { shielded, allocated: shielded ? "0" : String(ALLOCATED) },
    },
  };
}

/** Starting state shown before the first action. */
export function rehearsalBaseline(): RehearsalResult["state"] {
  const at = new Date().toISOString();
  const sc = scoreSnapshot(demoSnapshot(DEMO_BASELINE, at), [], at);
  return {
    multisig: { threshold: DEMO_BASELINE.threshold, members: SIGNERS.length, timeLock: DEMO_BASELINE.timeLock },
    authorityIsVault: true,
    risk: { score: sc.score, grade: sc.grade, red: sc.red, version: 1 },
    position: { shielded: false, allocated: String(ALLOCATED) },
  };
}
