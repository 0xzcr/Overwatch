import { describe, expect, it } from "vitest";
import { scoreSnapshot, FLAG, RED_MASK, isRed, gradeFor, flagNames, diffSnapshots, DRIFT_STEPS } from "../src";
import type { OverwatchEvent } from "../src";
import { ms, snap } from "./helpers";

describe("scoring", () => {
  it("strong setup scores A", () => {
    const r = scoreSnapshot(snap(), []);
    expect(r.score).toBe(100); expect(r.grade).toBe("A"); expect(r.flags).toBe(0n); expect(r.red).toBe(false);
  });
  it("single key → −60, red", () => {
    const p = snap().programs[0]!;
    const r = scoreSnapshot(snap({ programs: [{ ...p, authorityKind: "SINGLE_KEY" }], multisigs: [] }), []);
    expect(r.score).toBe(40); expect(r.grade).toBe("D"); expect(r.flags & FLAG.SINGLE_KEY).toBeTruthy(); expect(r.red).toBe(true);
  });
  it("2-of-5, no timelock, controlled → F and red via NO_TIMELOCK_LOW_THRESHOLD", () => {
    const r = scoreSnapshot(snap({ multisigs: [ms({ threshold: 2, timeLockSec: 0, configAuthority: "K" })] }), []);
    expect(r.score).toBe(100 - 20 - 20 - 25); expect(r.grade).toBe("F");
    expect(flagNames(r.flags)).toEqual(["NO_TIMELOCK", "LOW_THRESHOLD", "CONTROLLED_MULTISIG", "NO_TIMELOCK_LOW_THRESHOLD"]);
    expect(r.red).toBe(true);
  });
  it("no timelock alone is not red", () => {
    const r = scoreSnapshot(snap({ multisigs: [ms({ timeLockSec: 0 })] }), []);
    expect(r.flags & FLAG.NO_TIMELOCK).toBeTruthy(); expect(r.red).toBe(false); expect(r.score).toBe(75);
  });
  it("timelock tiers and ratio", () => {
    expect(scoreSnapshot(snap({ multisigs: [ms({ timeLockSec: 3600 })] }), []).score).toBe(85);
    expect(scoreSnapshot(snap({ multisigs: [ms({ timeLockSec: 90000 })] }), []).score).toBe(95);
    const seven = ["A", "B", "C", "D", "E", "F", "G"].map((key) => ({ key, permissions: 7 }));
    expect(scoreSnapshot(snap({ multisigs: [ms({ members: seven })] }), []).breakdown.map((d) => d.key)).toEqual(["threshold_ratio"]);
  });
  it("nonce signers capped at −30 and red", () => {
    const nonces = ["A", "B", "C", "D"].map((a, i) => ({ address: `N${i}`, authority: a, blockhash: "h" }));
    const r = scoreSnapshot(snap({ nonces }), []);
    expect(r.breakdown.find((d) => d.key === "signer_nonce")!.points).toBe(30); expect(r.red).toBe(true);
  });
  it("pending weakening, recent events, collateral & oracle, unverified", () => {
    const pending = [{ transactionIndex: 2, status: "Active", configTransaction: "c", actions: [{ kind: "ChangeThreshold" as const, newThreshold: 1 }] }];
    const ev = [{ severity: "CRITICAL", weakening: true, blockTime: "2026-09-20T00:00:00Z", detectedAt: "2026-09-20T00:00:00Z", title: "x" }] as Pick<OverwatchEvent, "severity" | "weakening" | "blockTime" | "detectedAt" | "title">[];
    const mint = { address: "M", tokenProgram: "token-2022" as const, mintAuthority: null, freezeAuthority: null, permanentDelegate: "D", transferHookProgram: null, defaultAccountStateFrozen: false, pausable: false, extensions: [] };
    const ors = [1, 2].map((i) => ({ address: `O${i}`, owner: "x", kind: "SWITCHBOARD" as const, deprecated: true }));
    const r = scoreSnapshot(snap({ multisigs: [ms({ pending })], mints: [mint], oracles: ors, verified: false }), ev, "2026-10-01T00:00:00Z");
    expect(r.score).toBe(100 - 10 - 10 - 20);
    for (const f of ["PENDING_WEAKENING", "RECENT_WEAKENING", "RECENT_CRITICAL", "RISKY_COLLATERAL", "DEPRECATED_ORACLE", "UNVERIFIED"]) expect(flagNames(r.flags)).toContain(f);
    expect(r.red).toBe(true);
    expect(scoreSnapshot(snap(), ev, "2026-12-01T00:00:00Z").flags).toBe(0n); // event older than 30 days
  });
  it("immutable programs skip upgrade-multisig deductions; clamps at 0", () => {
    const p = snap().programs[0]!;
    const r = scoreSnapshot(snap({ programs: [{ ...p, upgradeAuthority: null, authorityKind: "IMMUTABLE" }], multisigs: [ms({ threshold: 1, timeLockSec: 0 })] }), []);
    expect(r.score).toBe(100);
    const worst = scoreSnapshot(snap({ programs: [{ ...p, authorityKind: "SINGLE_KEY" }], multisigs: [ms({ threshold: 1, timeLockSec: 0, configAuthority: "K" })], nonces: ["A", "B", "C"].map((a) => ({ address: a + "n", authority: a, blockhash: "" })) }), []);
    expect(worst.score).toBe(0); expect(worst.grade).toBe("F");
  });
  it("unmapped control deducts 15 and flags UNVERIFIED", () => {
    const p = snap().programs[0]!;
    const r = scoreSnapshot(snap({ programs: [{ ...p, authorityKind: "OTHER_PROGRAM_PDA", multisig: null }], multisigs: [] }), []);
    expect(r.score).toBe(85); expect(flagNames(r.flags)).toEqual(["UNVERIFIED"]);
    expect(scoreSnapshot(snap({ multisigs: [] }), []).breakdown[0]!.key).toBe("unmapped_control");
  });
  it("RED_MASK is exactly bits 0, 4, 10, 11 and grades map", () => {
    expect(RED_MASK).toBe((1n << 0n) | (1n << 4n) | (1n << 10n) | (1n << 11n));
    expect(isRed(FLAG.NO_TIMELOCK)).toBe(false); expect(isRed(FLAG.NO_TIMELOCK_LOW_THRESHOLD)).toBe(true);
    expect([85, 70, 55, 40, 39].map(gradeFor)).toEqual(["A", "B", "C", "D", "F"]);
  });
});

describe("Drift timeline replay (reconstructed)", () => {
  it("fires alerts on Mar 23, Mar 27 and Mar 30, and the vault would be red before Apr 1", () => {
    const history: OverwatchEvent[] = [];
    const byDate: Record<string, OverwatchEvent[]> = {};
    for (let i = 1; i < DRIFT_STEPS.length; i++) {
      const step = DRIFT_STEPS[i]!;
      const e = diffSnapshots(DRIFT_STEPS[i - 1]!.snapshot, step.snapshot, { history, slot: i, blockTime: step.date, now: step.date, name: "Drift" });
      history.push(...e);
      byDate[step.date.slice(0, 10)] = e;
    }
    expect(byDate["2026-03-23"]!.map((e) => e.type)).toEqual(["SIGNER_NONCE_ACCOUNT_CREATED", "SIGNER_NONCE_ACCOUNT_CREATED"]);
    expect(byDate["2026-03-23"]!.some((e) => e.severity === "CRITICAL")).toBe(true); // 2 signers ≥ threshold 2
    const m27 = byDate["2026-03-27"]!;
    expect(m27.find((e) => e.type === "MEMBERS_CHANGED")!.severity).toBe("CRITICAL");
    expect(m27.find((e) => e.type === "MEMBERS_CHANGED")!.labels).toContain("Drift pattern");
    expect(byDate["2026-03-30"]!.every((e) => e.type === "SIGNER_NONCE_ACCOUNT_CREATED" && e.severity === "CRITICAL")).toBe(true);
    expect(byDate["2026-04-01"]!.map((e) => e.type)).toContain("ADMIN_PARAM_CHANGED");
    const pre = scoreSnapshot(DRIFT_STEPS[3]!.snapshot, history.filter((e) => e.detectedAt <= DRIFT_STEPS[3]!.date), DRIFT_STEPS[3]!.date);
    expect(pre.red).toBe(true);
    expect(pre.grade).toBe("F");
  });
});
