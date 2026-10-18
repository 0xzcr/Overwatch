import type { OracleKind } from "../types";

export interface OracleProgram {
  id: string;
  kind: OracleKind;
  name: string;
  deprecated: boolean;
  source: string;
}

// Each ID is checked onchain by `pnpm tsx scripts/dev/verify-constants.ts` (exists + executable).
export const ORACLE_PROGRAMS: OracleProgram[] = [
  // https://docs.pyth.network/price-feeds/contract-addresses/solana
  {
    id: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
    kind: "PYTH",
    name: "Pyth Solana Receiver",
    deprecated: false,
    source: "https://docs.pyth.network/price-feeds/contract-addresses/solana",
  },
  {
    id: "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
    kind: "PYTH",
    name: "Pyth Push Oracle",
    deprecated: false,
    source: "https://docs.pyth.network/price-feeds/contract-addresses/solana",
  },
  {
    id: "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH",
    kind: "PYTH",
    name: "Pyth Oracle (legacy)",
    deprecated: false,
    source: "https://docs.pyth.network/price-feeds/contract-addresses/solana",
  },
  // https://docs.switchboard.xyz — service shut down on 2026-09-25: any feed owned by these programs is treated as deprecated.
  {
    id: "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f",
    kind: "SWITCHBOARD",
    name: "Switchboard v2",
    deprecated: true,
    source: "https://docs.switchboard.xyz",
  },
  {
    id: "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv",
    kind: "SWITCHBOARD",
    name: "Switchboard On-Demand",
    deprecated: true,
    source: "https://docs.switchboard.xyz",
  },
  // https://docs.chain.link/data-feeds/solana
  {
    id: "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny",
    kind: "CHAINLINK",
    name: "Chainlink OCR2 Store",
    deprecated: false,
    source: "https://docs.chain.link/data-feeds/solana",
  },
];

export function classifyOracleOwner(
  owner: string,
  protocolPrograms: string[] = [],
): { kind: OracleKind; deprecated: boolean } {
  const p = ORACLE_PROGRAMS.find((o) => o.id === owner);
  if (p) return { kind: p.kind, deprecated: p.deprecated };
  if (protocolPrograms.includes(owner)) return { kind: "PROTOCOL_OWNED", deprecated: false };
  return { kind: "UNKNOWN", deprecated: false };
}
