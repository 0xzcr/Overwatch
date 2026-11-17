/**
 * Data model for the proposed Overwatch ruleset (v2).
 *
 * Everything that can change a protocol is described as a tree of authorities. The engine walks the tree and asks,
 * for each thing an attacker wants (a capability), "what is the cheapest way to get it": how many independent keys
 * must be stolen, and how long the change waits before it takes effect.
 */

export const MINUTE = 60;
export const HOUR = 3_600;
export const DAY = 86_400;

export type Grade = "A" | "B" | "C" | "D" | "F";
export const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const SEVERITIES: Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** One private key. */
export interface Key {
  kind: "key";
  id: string;
  /** keys proven to be held by one party (created in one transaction, always sign together) share a cluster */
  cluster?: string;
  /** a hot wallet: active in unrelated apps */
  exposed?: boolean;
  /** the authority of a durable nonce account */
  nonce?: boolean;
  /** never seen before, or funded in the last few days */
  fresh?: boolean;
}

/** A multisig member. Members without the vote permission cannot approve. */
export interface Member {
  who: Authority;
  vote?: boolean;
}

/** Squads v4 spending limit: its users can move funds with no vote and no timelock. */
export interface SpendingLimit {
  /** any signing key, not tied to multisig membership */
  users: Authority[];
  /** share of the vault that can leave per period, 0 to 1 */
  share: number;
  /** "any" when the destination list is empty */
  destinations: "any" | "protocol";
}

export interface Multisig {
  kind: "multisig";
  id: string;
  threshold: number;
  members: Member[];
  /** seconds between approval and execution */
  timelock: number;
  /** a controlled multisig: this authority changes members, threshold and timelock with no vote */
  configAuthority?: Authority | null;
  spendingLimits?: SpendingLimit[];
}

/** SPL Governance (Realms). */
export interface Dao {
  kind: "dao";
  id: string;
  holders: { who: Authority; share: number }[];
  /** share of all voting power needed to pass a proposal */
  passShare: number;
  votingTime: number;
  /** waiting time after a vote passes and before it can execute */
  holdUp: number;
  /** "early": a proposal passes the moment it has enough votes */
  tipping: "early" | "strict";
  /** an independent council can veto */
  veto: boolean;
  council?: { members: Authority[]; threshold: number } | null;
  /** each of these can hand itself votes */
  realmAuthority?: Authority | null;
  councilMintAuthority?: Authority | null;
  pluginUpgradeAuthority?: Authority | null;
}

export interface Immutable {
  kind: "immutable";
}

/** A controller Overwatch cannot decode. Unknown is not safe. */
export interface Unknown {
  kind: "unknown";
  id: string;
}

export type Authority = Key | Multisig | Dao | Immutable | Unknown;

/**
 * What an attacker wants. FREEZE blocks withdrawals; PAUSE only stops new deposits or trades.
 * Every other capability can drain funds.
 */
export type Capability = "CODE" | "FUNDS" | "MINT" | "PRICE" | "RISK" | "BRIDGE" | "STAKE" | "FREEZE" | "PAUSE";

export interface Control {
  capability: Capability;
  label: string;
  by: Authority;
  /** a stated trust assumption, such as a regulated stablecoin issuer: listed, never graded */
  trusted?: string;
  /** deployed code does not match a public verified build */
  unverified?: boolean;
}

export type ExitLatency = number | "unknown";

export interface Protocol {
  id: string;
  controls: Control[];
  /** time users need to get their money out (unstaking, withdrawal queues); "unknown" when nobody has checked */
  exitLatency?: ExitLatency;
}
