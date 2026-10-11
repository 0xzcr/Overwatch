import { describe, expect, it } from "vitest";
import { diffSnapshots, snapshotHash, fmtDuration, short, people, actionWeakens } from "../src";
import type { OverwatchEvent } from "../src";
import { ctx, ms, snap } from "./helpers";

const types = (e: OverwatchEvent[]) => e.map((x) => `${x.type}:${x.severity}`);

describe("rules engine", () => {
  it("first sighting emits nothing", () => {
    expect(diffSnapshots(null, snap(), ctx())).toEqual([]);
  });
  it("timelock removed → CRITICAL; reduced → HIGH; increased → INFO", () => {
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ timeLockSec: 0 })] }), ctx()))).toEqual(["TIMELOCK_REMOVED:CRITICAL"]);
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ timeLockSec: 3600 })] }), ctx()))).toEqual(["TIMELOCK_REDUCED:HIGH"]);
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ timeLockSec: 999999 })] }), ctx()))).toEqual(["TIMELOCK_INCREASED:INFO"]);
  });
  it("threshold lowered → HIGH, ≤2 → CRITICAL, raised → INFO", () => {
    const five = ["A", "B", "C", "D", "E", "F", "G"].map((key) => ({ key, permissions: 7 }));
    const a = snap({ multisigs: [ms({ threshold: 5, members: five })] });
    expect(types(diffSnapshots(a, snap({ multisigs: [ms({ threshold: 4, members: five })] }), ctx()))).toEqual(["THRESHOLD_LOWERED:HIGH"]);
    expect(types(diffSnapshots(a, snap({ multisigs: [ms({ threshold: 2, members: five })] }), ctx()))).toEqual(["THRESHOLD_LOWERED:CRITICAL"]);
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ threshold: 4 })] }), ctx()))).toEqual(["THRESHOLD_RAISED:INFO"]);
  });
  it("config authority set/removed", () => {
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ configAuthority: "K" })] }), ctx()))).toEqual(["CONFIG_AUTHORITY_SET:HIGH"]);
    expect(types(diffSnapshots(snap({ multisigs: [ms({ configAuthority: "K" })] }), snap(), ctx()))).toEqual(["CONFIG_AUTHORITY_REMOVED:INFO"]);
    // controlled multisig first seen on a later snapshot (e.g. migration to new role)
    expect(types(diffSnapshots(snap({ multisigs: [] }), snap({ multisigs: [ms({ configAuthority: "K" })] }), ctx()))).toEqual(["CONFIG_AUTHORITY_SET:HIGH"]);
  });
  it("members changed MEDIUM, HIGH with threshold change (now or within 7d)", () => {
    const m2 = ["A", "B", "C", "D", "Z"].map((key) => ({ key, permissions: 7 }));
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ members: m2 })] }), ctx()))).toEqual(["MEMBERS_CHANGED:MEDIUM"]);
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ members: m2, threshold: 2 })] }), ctx()))).toContain("MEMBERS_CHANGED:HIGH");
    const hist = [{ type: "THRESHOLD_LOWERED", detectedAt: "2026-09-28T00:00:00Z", blockTime: null, weakening: true, severity: "HIGH" }] as never[];
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ members: m2 })] }), ctx(undefined, hist)))).toEqual(["MEMBERS_CHANGED:HIGH"]);
  });
  it("upgrade authority changes", () => {
    const p = snap().programs[0]!;
    expect(types(diffSnapshots(snap(), snap({ programs: [{ ...p, upgradeAuthority: "K", authorityKind: "SINGLE_KEY" }] }), ctx()))).toEqual(["AUTHORITY_BECAME_SINGLE_KEY:CRITICAL"]);
    expect(types(diffSnapshots(snap(), snap({ programs: [{ ...p, upgradeAuthority: "V2" }] }), ctx()))).toEqual(["UPGRADE_AUTHORITY_CHANGED:CRITICAL"]);
    expect(types(diffSnapshots(snap(), snap({ programs: [{ ...p, upgradeAuthority: null, authorityKind: "IMMUTABLE" }] }), ctx()))).toEqual(["PROGRAM_MADE_IMMUTABLE:INFO"]);
    expect(types(diffSnapshots(snap(), snap({ programs: [{ ...p, lastDeploySlot: 200 }] }), ctx()))).toEqual(["PROGRAM_UPGRADED:MEDIUM"]);
  });
  it("pending weakening proposals alert once", () => {
    const pending = [{ transactionIndex: 5, status: "Active", configTransaction: "C", actions: [{ kind: "SetTimeLock" as const, newTimeLock: 0 }] }];
    const b = snap({ multisigs: [ms({ pending })] });
    const e = diffSnapshots(snap(), b, ctx());
    expect(types(e)).toEqual(["PROPOSAL_WEAKENS_CONTROLS:HIGH"]);
    expect(e[0]!.title).toMatch(/remove the safety delay/);
    expect(diffSnapshots(b, b, ctx())).toEqual([]);
    expect(diffSnapshots(snap(), snap({ multisigs: [ms({ pending: [{ ...pending[0]!, actions: [{ kind: "SetRentCollector", collector: null }] }] })] }), ctx())).toEqual([]);
  });
  it("actionWeakens", () => {
    const m = { threshold: 3, timeLockSec: 100 };
    expect(actionWeakens(m, { kind: "ChangeThreshold", newThreshold: 2 })).toMatch(/threshold/);
    expect(actionWeakens(m, { kind: "ChangeThreshold", newThreshold: 4 })).toBeNull();
    expect(actionWeakens(m, { kind: "SetTimeLock", newTimeLock: 50 })).toMatch(/cut/);
    expect(actionWeakens(m, { kind: "AddMember", key: "abcdefgh", permissions: 7 })).toMatch(/add signer/);
    expect(actionWeakens(m, { kind: "RemoveMember", key: "x" })).toBeNull();
  });
  it("nonce accounts: HIGH, CRITICAL once ≥ threshold signers exposed, closed → INFO", () => {
    const one = snap({ nonces: [{ address: "N1", authority: "A", blockhash: "h" }] });
    expect(types(diffSnapshots(snap(), one, ctx()))).toEqual(["SIGNER_NONCE_ACCOUNT_CREATED:HIGH"]);
    const three = snap({ nonces: ["A", "B", "C"].map((a, i) => ({ address: `N${i}`, authority: a, blockhash: "h" })) });
    expect(types(diffSnapshots(one, three, ctx()))).toEqual(["SIGNER_NONCE_ACCOUNT_CREATED:CRITICAL", "SIGNER_NONCE_ACCOUNT_CREATED:CRITICAL"]);
    expect(types(diffSnapshots(one, snap(), ctx()))).toEqual(["SIGNER_NONCE_ACCOUNT_CLOSED:INFO"]);
  });
  it("compound Drift pattern: weakening within 14 days of a nonce → CRITICAL", () => {
    const hist = [{ type: "SIGNER_NONCE_ACCOUNT_CREATED", detectedAt: "2026-09-25T00:00:00Z", blockTime: null, weakening: true, severity: "HIGH" }] as never[];
    const e = diffSnapshots(snap(), snap({ multisigs: [ms({ timeLockSec: 3600 })] }), ctx(undefined, hist));
    expect(types(e)).toEqual(["TIMELOCK_REDUCED:CRITICAL"]);
    expect(e[0]!.labels).toContain("Drift pattern");
    const old = [{ type: "SIGNER_NONCE_ACCOUNT_CREATED", detectedAt: "2026-08-01T00:00:00Z", blockTime: null, weakening: true, severity: "HIGH" }] as never[];
    expect(types(diffSnapshots(snap(), snap({ multisigs: [ms({ timeLockSec: 3600 })] }), ctx(undefined, old)))).toEqual(["TIMELOCK_REDUCED:HIGH"]);
    // nonce after a recent weakening also escalates
    const weak = [{ type: "TIMELOCK_REDUCED", detectedAt: "2026-09-29T00:00:00Z", blockTime: null, weakening: true, severity: "HIGH" }] as never[];
    const n = diffSnapshots(snap(), snap({ nonces: [{ address: "N1", authority: "A", blockhash: "h" }] }), ctx(undefined, weak));
    expect(types(n)).toEqual(["SIGNER_NONCE_ACCOUNT_CREATED:CRITICAL"]);
  });
  it("collateral, oracle and admin changes", () => {
    const mint = { address: "M", tokenProgram: "token-2022" as const, mintAuthority: null, freezeAuthority: null, permanentDelegate: "D", transferHookProgram: null, defaultAccountStateFrozen: false, pausable: false, extensions: ["PermanentDelegate"] };
    expect(types(diffSnapshots(snap(), snap({ mints: [mint] }), ctx()))).toEqual(["COLLATERAL_RISKY_EXTENSION:HIGH"]);
    const or = { address: "O", owner: "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv", kind: "SWITCHBOARD" as const, deprecated: true };
    expect(types(diffSnapshots(snap(), snap({ oracles: [or] }), ctx()))).toEqual(["ORACLE_DEPRECATED:HIGH"]);
    const ad = { account: "S", adapter: "x", admin: "A1", params: { withdrawLimit: 10 }, oracles: [], mints: ["M1"] };
    const e = diffSnapshots(snap({ admin: [ad] }), snap({ admin: [{ ...ad, admin: "A2", params: { withdrawLimit: 99 }, mints: ["M1", "CVT"] }] }), ctx());
    expect(types(e)).toEqual(["ADMIN_PARAM_CHANGED:HIGH", "ADMIN_PARAM_CHANGED:MEDIUM", "ADMIN_PARAM_CHANGED:HIGH"]);
  });
  it("hash ignores slot/time, changes with content", () => {
    expect(snapshotHash(snap({ slot: 9, takenAt: "x" }))).toBe(snapshotHash(snap()));
    expect(snapshotHash(snap({ multisigs: [ms({ threshold: 1 })] }))).not.toBe(snapshotHash(snap()));
  });
  it("formatters", () => {
    expect(fmtDuration(0)).toBe("no delay"); expect(fmtDuration(86400)).toBe("1 day"); expect(fmtDuration(172800)).toBe("2 days");
    expect(fmtDuration(3600)).toBe("1 hour"); expect(fmtDuration(5400)).toBe("1.5 hours"); expect(fmtDuration(600)).toBe("10 min");
    expect(short(null)).toBe("none"); expect(short("abcdefghij")).toBe("abcd…ghij"); expect(people(1)).toBe("1 person");
  });
});
