import type { ControlSnapshot, MultisigFacts } from "../src";
export const ms = (o: Partial<MultisigFacts> = {}): MultisigFacts => ({
  address: "MS1", version: "v4", vaultIndex: 0, role: "upgrade_authority", threshold: 3,
  members: ["A", "B", "C", "D", "E"].map((key) => ({ key, permissions: 7 })), timeLockSec: 172800,
  configAuthority: null, transactionIndex: 1, staleTransactionIndex: 0, pending: [], ...o,
});
export const snap = (o: Partial<ControlSnapshot> = {}): ControlSnapshot => ({
  protocol: "test", slot: 1, takenAt: "2026-10-01T00:00:00Z",
  programs: [{ programId: "P1", label: "Main program", programDataAddress: "PD1", lastDeploySlot: 100, upgradeAuthority: "V1", authorityKind: "SQUADS_V4_VAULT", authorityOwner: "11111111111111111111111111111111", multisig: "MS1" }],
  multisigs: [ms()], nonces: [], mints: [], oracles: [], admin: [], verified: true, ...o,
});
export const ctx = (now = "2026-10-01T00:00:00Z", history: never[] = []) => ({ history, slot: 2, blockTime: now, now, name: "Test" });
