export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const SEVERITY_ORDER: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export type AuthorityKind =
  | "IMMUTABLE"
  | "SQUADS_V4_VAULT"
  | "SQUADS_V3"
  | "REALMS_GOVERNANCE"
  | "OTHER_PROGRAM_PDA"
  | "SINGLE_KEY"
  | "UNKNOWN";

export interface ProgramFacts {
  programId: string;
  label: string;
  programDataAddress: string;
  lastDeploySlot: number;
  upgradeAuthority: string | null;
  authorityKind: AuthorityKind;
  /** owner program of the authority account, if it exists */
  authorityOwner: string | null;
  /** multisig address controlling the authority (Squads v4), if mapped & verified */
  multisig: string | null;
}

export interface MultisigMember {
  key: string;
  /** Squads permission bitmask: 1 initiate, 2 vote, 4 execute */
  permissions: number;
}

export type ConfigActionLite =
  | { kind: "AddMember"; key: string; permissions: number }
  | { kind: "RemoveMember"; key: string }
  | { kind: "ChangeThreshold"; newThreshold: number }
  | { kind: "SetTimeLock"; newTimeLock: number }
  | { kind: "SetRentCollector"; collector: string | null }
  | { kind: "Other"; name: string };

export interface PendingConfigProposal {
  transactionIndex: number;
  status: string;
  actions: ConfigActionLite[];
  configTransaction: string;
}

export interface MultisigFacts {
  address: string;
  version: "v4" | "v3";
  vaultIndex: number;
  role: string;
  threshold: number;
  members: MultisigMember[];
  timeLockSec: number;
  configAuthority: string | null;
  transactionIndex: number;
  staleTransactionIndex: number;
  pending: PendingConfigProposal[];
}

export interface NonceFacts {
  address: string;
  authority: string;
  blockhash: string;
}

export interface MintFacts {
  address: string;
  tokenProgram: "spl-token" | "token-2022";
  mintAuthority: string | null;
  freezeAuthority: string | null;
  permanentDelegate: string | null;
  transferHookProgram: string | null;
  defaultAccountStateFrozen: boolean;
  pausable: boolean;
  extensions: string[];
}

export type OracleKind = "PYTH" | "SWITCHBOARD" | "REDSTONE" | "CHAINLINK" | "PROTOCOL_OWNED" | "UNKNOWN";
export interface OracleFacts {
  address: string;
  owner: string;
  kind: OracleKind;
  deprecated: boolean;
}

export interface AdminFacts {
  account: string;
  adapter: string;
  admin: string | null;
  guardian?: string | null;
  listingAuthority?: string | null;
  params: Record<string, string | number | boolean | null>;
  oracles: string[];
  mints: string[];
}

export interface ControlSnapshot {
  protocol: string;
  slot: number;
  takenAt: string;
  programs: ProgramFacts[];
  multisigs: MultisigFacts[];
  /** active durable nonce accounts whose authority is a watched signer */
  nonces: NonceFacts[];
  mints: MintFacts[];
  oracles: OracleFacts[];
  admin: AdminFacts[];
  verified: boolean;
}

export type EventType =
  | "TIMELOCK_REMOVED"
  | "TIMELOCK_REDUCED"
  | "TIMELOCK_INCREASED"
  | "THRESHOLD_LOWERED"
  | "THRESHOLD_RAISED"
  | "UPGRADE_AUTHORITY_CHANGED"
  | "AUTHORITY_BECAME_SINGLE_KEY"
  | "PROGRAM_MADE_IMMUTABLE"
  | "SIGNER_NONCE_ACCOUNT_CREATED"
  | "SIGNER_NONCE_ACCOUNT_CLOSED"
  | "SIGNER_DURABLE_NONCE_TX"
  | "CONFIG_AUTHORITY_SET"
  | "CONFIG_AUTHORITY_REMOVED"
  | "MEMBERS_CHANGED"
  | "PROPOSAL_WEAKENS_CONTROLS"
  | "PROGRAM_UPGRADED"
  | "COLLATERAL_RISKY_EXTENSION"
  | "ORACLE_DEPRECATED"
  | "ADMIN_PARAM_CHANGED"
  | "MULTISIG_CONFIG_EXECUTED";

export interface OverwatchEvent {
  protocol: string;
  type: EventType;
  severity: Severity;
  /** true if the change weakens controls (used by the compound rule and scoring) */
  weakening: boolean;
  title: string;
  explanation: string;
  before: unknown;
  after: unknown;
  slot: number;
  blockTime: string | null;
  txSignature: string | null;
  detectedAt: string;
  labels: string[];
}
