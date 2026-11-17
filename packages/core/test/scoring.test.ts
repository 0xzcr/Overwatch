import { describe, expect, it } from "vitest";
import { scoreSnapshot, FLAG, RED_MASK, isRed, gradeFor, flagNames, diffSnapshots, DRIFT_STEPS } from "../src";
import type { OverwatchEvent } from "../src";
import { ms, snap } from "./helpers";

describe("scoring (v4 grid ruleset)", () => {
  const p = () => snap().programs[0]!;
  const seven = ["A", "B", "C", "D", "E", "F", "G"].map((key) => ({ key, permissions: 7 }));

  it("3-of-5 with 48h is C (three keys, 24h-7d), not red", () => {
    const r = scoreSnapshot(snap(), []);
    expect(r.grade).toBe("C");
    expect(r.score).toBe(65);
    expect(r.red).toBe(false);
    expect(r.ruleset).toBe("v4.1");
    expect(r.capabilities[0]).toMatchObject({ capability: "CODE", grade: "C", keys: 3, delaySec: 172800 });
  });
  it("4-of-7 with 30 days is A", () => {
    const r = scoreSnapshot(snap({ multisigs: [ms({ threshold: 4, members: seven, timeLockSec: 30 * 86400 })] }), []);
    expect(r.grade).toBe("A");
    expect(r.flags).toBe(0n);
  });
  it("single key with no delay is F and red, through both red bits", () => {
    const r = scoreSnapshot(snap({ programs: [{ ...p(), authorityKind: "SINGLE_KEY" }], multisigs: [] }), []);
    expect(r.grade).toBe("F");
    expect(r.red).toBe(true);
    expect(flagNames(r.flags)).toEqual(expect.arrayContaining(["SINGLE_KEY", "DRAIN_PATH_F"]));
    expect(isRed(r.flags)).toBe(true);
  });
  it("2-of-5 with no delay is F and red; a config authority is a flag on top", () => {
    const r = scoreSnapshot(snap({ multisigs: [ms({ threshold: 2, timeLockSec: 0, configAuthority: null })] }), []);
    expect(r.grade).toBe("F");
    expect(r.red).toBe(true);
    expect(flagNames(r.flags)).toEqual(expect.arrayContaining(["NO_TIMELOCK", "LOW_THRESHOLD", "DRAIN_PATH_F"]));
  });
  it("no timelock with four keys is C, not red", () => {
    const r = scoreSnapshot(snap({ multisigs: [ms({ threshold: 4, timeLockSec: 0 })] }), []);
    expect(r.grade).toBe("C");
    expect(r.red).toBe(false);
    expect(isRed(r.flags)).toBe(false);
  });
  it("a longer timelock never lowers the grade", () => {
    const order = ["F", "D", "C", "B", "A"];
    const grades = [0, 3600, 86400, 7 * 86400, 30 * 86400].map(
      (t) => scoreSnapshot(snap({ multisigs: [ms({ threshold: 4, members: seven, timeLockSec: t })] }), []).grade,
    );
    grades.slice(1).forEach((g, i) => expect(order.indexOf(g)).toBeGreaterThanOrEqual(order.indexOf(grades[i]!)));
  });
  it("nonce signers, pending weakening, recent events, collateral and oracle are flags: grade unchanged", () => {
    const base = scoreSnapshot(snap(), []);
    const nonces = ["A", "B", "C", "D"].map((a, i) => ({ address: `N${i}`, authority: a, blockhash: "h" }));
    const pending = [
      {
        transactionIndex: 2,
        status: "Active",
        configTransaction: "c",
        actions: [{ kind: "ChangeThreshold" as const, newThreshold: 1 }],
      },
    ];
    const ev = [
      {
        severity: "CRITICAL",
        weakening: true,
        blockTime: "2026-09-20T00:00:00Z",
        detectedAt: "2026-09-20T00:00:00Z",
        title: "x",
      },
    ] as Pick<OverwatchEvent, "severity" | "weakening" | "blockTime" | "detectedAt" | "title">[];
    const mint = {
      address: "M",
      tokenProgram: "token-2022" as const,
      mintAuthority: null,
      freezeAuthority: null,
      permanentDelegate: "D",
      transferHookProgram: null,
      defaultAccountStateFrozen: false,
      pausable: false,
      extensions: [],
    };
    const ors = [1, 2].map((i) => ({ address: `O${i}`, owner: "x", kind: "SWITCHBOARD" as const, deprecated: true }));
    const r = scoreSnapshot(
      snap({ multisigs: [ms({ pending })], nonces, mints: [mint], oracles: ors }),
      ev,
      "2026-10-01T00:00:00Z",
    );
    expect(r.grade).toBe(base.grade);
    expect(r.red).toBe(false);
    for (const f of [
      "SIGNER_NONCE",
      "PENDING_WEAKENING",
      "RECENT_WEAKENING",
      "RECENT_CRITICAL",
      "RISKY_COLLATERAL",
      "DEPRECATED_ORACLE",
    ])
      expect(flagNames(r.flags)).toContain(f);
    expect(isRed(r.flags)).toBe(false);
    expect(scoreSnapshot(snap(), ev, "2026-12-01T00:00:00Z").flags).toBe(0n); // event older than 30 days
  });
  it("immutable programs are A when nothing else is expected", () => {
    const r = scoreSnapshot(
      snap({ programs: [{ ...p(), upgradeAuthority: null, authorityKind: "IMMUTABLE" }], multisigs: [] }),
      [],
    );
    expect(r.grade).toBe("A");
    expect(r.score).toBe(95);
  });
  it("an immutable lending program with unmapped risk settings is B with PARTIAL_COVERAGE", () => {
    const r = scoreSnapshot(
      snap({ programs: [{ ...p(), upgradeAuthority: null, authorityKind: "IMMUTABLE" }], multisigs: [] }),
      [],
      undefined,
      { category: "lending" },
    );
    expect(r.grade).toBe("B");
    expect(r.uncovered).toEqual(["RISK"]);
    expect(flagNames(r.flags)).toContain("PARTIAL_COVERAGE");
  });
  it("unmapped control is unverified (no letter), published as C onchain, flags UNVERIFIED", () => {
    const r = scoreSnapshot(
      snap({ programs: [{ ...p(), authorityKind: "OTHER_PROGRAM_PDA", multisig: null }], multisigs: [] }),
      [],
    );
    expect(r.grade).toBe("?");
    expect(r.score).toBe(65);
    expect(r.capabilities[0]).toMatchObject({ grade: null, provisional: true });
    expect(r.provisional).toBe(true);
    expect(flagNames(r.flags)).toContain("UNVERIFIED");
    expect(r.breakdown.map((d) => d.key)).toContain("provisional");
  });
  it("a single-key admin makes a lending protocol red even with a strong upgrade multisig", () => {
    const admin = {
      account: "S",
      adapter: "x:State",
      admin: "H7PiGqqUaanBovwKgEtreJbKmQe6dbq6VTrw6guy7ZgL",
      params: {},
      oracles: [],
      mints: [],
    };
    const r = scoreSnapshot(snap({ admin: [admin] }), [], undefined, { category: "lending" });
    expect(r.grade).toBe("F");
    expect(r.red).toBe(true);
    expect(r.capabilities.find((c) => c.capability === "RISK")).toMatchObject({ grade: "F", keys: 1 });
  });
  it("an admin with no instructions in the deployed code is not graded, until the program is redeployed", () => {
    const admin = {
      account: "S",
      adapter: "x:State",
      admin: "H7PiGqqUaanBovwKgEtreJbKmQe6dbq6VTrw6guy7ZgL",
      params: {},
      oracles: [],
      mints: [],
    };
    const dead = { adapter: "x:State", share: 0, source: "no admin instructions", deploy_slot: 100 };
    const now = scoreSnapshot(snap({ admin: [admin] }), [], undefined, { category: "lending", adminLimits: [dead] });
    expect(now.red).toBe(false);
    expect(now.capabilities.find((c) => c.capability === "RISK")).toMatchObject({ grade: null });
    // a redeploy (new deploy slot) voids the check: the one-key admin path is back, F and red
    const redeployed = snap({ admin: [admin], programs: [{ ...p(), lastDeploySlot: 200 }] });
    const after = scoreSnapshot(redeployed, [], undefined, { category: "lending", adminLimits: [dead] });
    expect(after.grade).toBe("F");
    expect(after.red).toBe(true);
  });
  it("RED_MASK keeps bits 0, 4, 10, 11 for the deployed registry, and grades map", () => {
    expect(RED_MASK).toBe((1n << 0n) | (1n << 4n) | (1n << 10n) | (1n << 11n));
    expect(isRed(FLAG.NO_TIMELOCK)).toBe(false);
    expect(isRed(FLAG.DRAIN_PATH_F)).toBe(true);
    expect(isRed(FLAG.SIGNER_NONCE)).toBe(false);
    expect([95, 80, 65, 50, 20].map(gradeFor)).toEqual(["A", "B", "C", "D", "F"]);
  });
});

describe("Drift timeline replay (reconstructed)", () => {
  it("fires alerts on Mar 23, Mar 27 and Mar 30, and the vault would be red before Apr 1", () => {
    const history: OverwatchEvent[] = [];
    const byDate: Record<string, OverwatchEvent[]> = {};
    for (let i = 1; i < DRIFT_STEPS.length; i++) {
      const step = DRIFT_STEPS[i]!;
      const e = diffSnapshots(DRIFT_STEPS[i - 1]!.snapshot, step.snapshot, {
        history,
        slot: i,
        blockTime: step.date,
        now: step.date,
        name: "Drift",
      });
      history.push(...e);
      byDate[step.date.slice(0, 10)] = e;
    }
    expect(byDate["2026-03-23"]!.map((e) => e.type)).toEqual([
      "SIGNER_NONCE_ACCOUNT_CREATED",
      "SIGNER_NONCE_ACCOUNT_CREATED",
    ]);
    expect(byDate["2026-03-23"]!.some((e) => e.severity === "CRITICAL")).toBe(true); // 2 signers ≥ threshold 2
    const m27 = byDate["2026-03-27"]!;
    expect(m27.find((e) => e.type === "MEMBERS_CHANGED")!.severity).toBe("CRITICAL");
    expect(m27.find((e) => e.type === "MEMBERS_CHANGED")!.labels).toContain("Drift pattern");
    expect(
      byDate["2026-03-30"]!.every((e) => e.type === "SIGNER_NONCE_ACCOUNT_CREATED" && e.severity === "CRITICAL"),
    ).toBe(true);
    expect(byDate["2026-04-01"]!.map((e) => e.type)).toContain("ADMIN_PARAM_CHANGED");
    const pre = scoreSnapshot(
      DRIFT_STEPS[3]!.snapshot,
      history.filter((e) => e.detectedAt <= DRIFT_STEPS[3]!.date),
      DRIFT_STEPS[3]!.date,
    );
    expect(pre.red).toBe(true);
    expect(pre.grade).toBe("F");
  });
});
