import type { ControlSnapshot, MultisigFacts, NonceFacts } from "./types";

/**
 * Drift Protocol, March–April 2026 — RECONSTRUCTED FROM PUBLIC INCIDENT REPORTS (not onchain data).
 * Signer / nonce identifiers below are placeholders ("signer-A" …); the reports do not publish full addresses.
 * Pre-migration threshold/timelock were not published; reports state 2-of-5 with zero timelock at the time of the attack,
 * so both councils are modelled with that configuration. The migration changed membership (one council member was replaced).
 */
export const DRIFT_SOURCES = [
  {
    label: "BlockSec — Drift Protocol incident: multisig governance compromise via durable nonce exploitation",
    url: "https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation",
  },
  {
    label: "Hypernative — The Drift exploit: when privileged access has no limits (Apr 5, 2026)",
    url: "https://hypernative.io/blog/the-drift-exploit-when-privileged-access-has-no-limits",
  },
  {
    label: "Four Pillars — Reflections on the Drift Protocol exploit",
    url: "https://research.4pillars.io/en/research/reflections-on-the-drift-protocol-exploit",
  },
  {
    label: "QuillAudits — Drift Protocol multisig exploit analysis",
    url: "https://www.quillaudits.com/blog/hack-analysis/drift-protocol-multisig-exploit",
  },
];

const member = (k: string) => ({ key: k, permissions: 7 });
const council = (address: string, keys: string[]): MultisigFacts => ({
  address,
  version: "v4",
  vaultIndex: 0,
  role: "admin",
  threshold: 2,
  members: keys.map(member),
  timeLockSec: 0,
  configAuthority: null,
  transactionIndex: 0,
  staleTransactionIndex: 0,
  pending: [],
});
const nonce = (address: string, authority: string): NonceFacts => ({ address, authority, blockhash: "reconstructed" });

const OLD = council("security-council-v1", ["signer-A", "signer-B", "signer-C", "signer-D", "signer-E"]);
const NEW = council("security-council-v2", ["signer-A", "signer-B", "signer-C", "signer-D", "signer-F"]);

const base = (
  date: string,
  ms: MultisigFacts,
  nonces: NonceFacts[],
  adminKey = "drift-admin (council vault)",
): ControlSnapshot => ({
  protocol: "drift",
  slot: 0,
  takenAt: date,
  programs: [],
  multisigs: [ms],
  nonces,
  mints: [],
  oracles: [],
  admin: [{ account: "drift-state", adapter: "drift", admin: adminKey, params: {}, oracles: [], mints: [] }],
  verified: false,
});

export interface DriftStep {
  date: string;
  headline: string;
  detail: string;
  snapshot: ControlSnapshot;
}

export const DRIFT_STEPS: DriftStep[] = [
  {
    date: "2026-03-20T00:00:00Z",
    headline: "Baseline",
    detail:
      "Security Council: 2-of-5 Squads multisig, zero timelock (configuration reported at the time of the attack). Overwatch would already grade this red: two people can change everything instantly.",
    snapshot: base("2026-03-20T00:00:00Z", OLD, []),
  },
  {
    date: "2026-03-23T12:00:00Z",
    headline: "Durable nonce accounts appear",
    detail:
      "Four durable nonce accounts are created: two tied to Security Council signers, two to the attacker. Two of five signers have now signed transactions that never expire.",
    snapshot: base("2026-03-23T12:00:00Z", OLD, [nonce("nonce-1", "signer-A"), nonce("nonce-2", "signer-B")]),
  },
  {
    date: "2026-03-27T12:00:00Z",
    headline: "Council migration",
    detail:
      "Planned Security Council migration after a member change. Still 2-of-5, still no timelock. Old pre-signed transactions are invalidated, but the attacker starts over.",
    snapshot: base("2026-03-27T12:00:00Z", NEW, []),
  },
  {
    date: "2026-03-30T12:00:00Z",
    headline: "New nonce on new council",
    detail:
      "A new durable nonce account is tied to a member of the new multisig, putting the attacker back at the 2-of-5 threshold.",
    snapshot: base("2026-03-30T12:00:00Z", NEW, [nonce("nonce-5", "signer-A"), nonce("nonce-6", "signer-B")]),
  },
  {
    date: "2026-04-01T16:05:00Z",
    headline: "Takeover and drain",
    detail:
      "Two pre-signed transactions, four slots apart, transfer admin to the attacker. CVT is listed as collateral with an attacker oracle, withdrawal limits are lifted, and ~$285.3M is drained in 31 withdrawals over ~12 minutes.",
    snapshot: base(
      "2026-04-01T16:05:00Z",
      NEW,
      [nonce("nonce-5", "signer-A"), nonce("nonce-6", "signer-B")],
      "attacker",
    ),
  },
];
