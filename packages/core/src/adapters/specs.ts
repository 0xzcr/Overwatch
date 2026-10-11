// Field specs copied from each protocol's onchain Anchor IDL (fixtures/idl/*.json, fetched 2026-10-11).
// test/adapters.test.ts asserts these match the IDL fixtures and decode the real captured accounts.
import type { IdlField, IdlTypeDef } from "./idl";

export const DRIFT_STATE: IdlField[] = [
  { name: "admin", type: "publicKey" }, { name: "whitelistMint", type: "publicKey" }, { name: "discountMint", type: "publicKey" },
  { name: "signer", type: "publicKey" }, { name: "srmVault", type: "publicKey" },
];
export const KAMINO_LENDING_MARKET: IdlField[] = [
  { name: "version", type: "u64" }, { name: "bumpSeed", type: "u64" }, { name: "lendingMarketOwner", type: "publicKey" },
  { name: "lendingMarketOwnerCached", type: "publicKey" }, { name: "quoteCurrency", type: { array: ["u8", 32] } }, { name: "referralFeeBps", type: "u16" },
  { name: "emergencyMode", type: "u8" }, { name: "autodeleverageEnabled", type: "u8" }, { name: "borrowDisabled", type: "u8" },
  { name: "priceRefreshTriggerToMaxAgePct", type: "u8" }, { name: "liquidationMaxDebtCloseFactorPct", type: "u8" }, { name: "insolvencyRiskUnhealthyLtvPct", type: "u8" },
  { name: "minFullLiquidationValueThreshold", type: "u64" }, { name: "maxLiquidatableDebtMarketValueAtOnce", type: "u64" }, { name: "reserved0", type: { array: ["u8", 8] } },
  { name: "globalAllowedBorrowValue", type: "u64" },
];
export const MARGINFI_GROUP: IdlField[] = [{ name: "admin", type: "pubkey" }, { name: "group_flags", type: "u64" }];
export const ORCA_WHIRLPOOLS_CONFIG: IdlField[] = [
  { name: "fee_authority", type: "pubkey" }, { name: "collect_protocol_fees_authority", type: "pubkey" },
  { name: "reward_emissions_super_authority", type: "pubkey" }, { name: "default_protocol_fee_rate", type: "u16" }, { name: "feature_flags", type: "u16" },
];
export const NO_TYPES: IdlTypeDef[] = [];
