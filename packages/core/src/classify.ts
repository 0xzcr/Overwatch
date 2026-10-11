import { isOnCurve } from "./base58";
import { REALMS_GOVERNANCE, SQUADS_V3, SQUADS_V4, SYSTEM_PROGRAM } from "./constants/programs";
import type { AuthorityKind } from "./types";

export interface AuthorityEvidence {
  authority: string | null;
  /** owner of the authority account; null if the account does not exist */
  owner: string | null;
  /** true when a hand-mapped Squads v4 multisig derives a vault PDA equal to the authority */
  squadsV4VaultMatch: boolean;
}

export function classifyAuthority(e: AuthorityEvidence): AuthorityKind {
  if (e.authority === null) return "IMMUTABLE";
  if (e.squadsV4VaultMatch) return "SQUADS_V4_VAULT";
  if (e.owner === SQUADS_V3) return "SQUADS_V3";
  if (e.owner && REALMS_GOVERNANCE.includes(e.owner)) return "REALMS_GOVERNANCE";
  if (e.owner === SQUADS_V4) return "UNKNOWN"; // a Squads-owned account (not a vault) can't sign upgrades
  const onCurve = isOnCurve(e.authority);
  if (onCurve && (e.owner === null || e.owner === SYSTEM_PROGRAM)) return "SINGLE_KEY";
  if (!onCurve) return "OTHER_PROGRAM_PDA";
  return "UNKNOWN";
}

export const AUTHORITY_LABEL: Record<AuthorityKind, string> = {
  IMMUTABLE: "Immutable (no one can upgrade)",
  SQUADS_V4_VAULT: "Squads v4 multisig",
  SQUADS_V3: "Squads v3 multisig (limited support)",
  REALMS_GOVERNANCE: "Realms DAO governance",
  OTHER_PROGRAM_PDA: "Program-controlled address (unmapped)",
  SINGLE_KEY: "Single private key",
  UNKNOWN: "Unknown",
};
