import { decode as b58, findProgramAddress, utf8 } from "../base58";
import { accountDiscriminator, decodePrefix } from "./idl";
import { DRIFT_STATE, KAMINO_LENDING_MARKET, MARGINFI_GROUP, ORCA_WHIRLPOOLS_CONFIG, NO_TYPES } from "./specs";
import { registerAdapter, type EncodedAccount, type ProtocolAdapter } from "./index";
import type { AdminFacts } from "../types";

const check = (acc: EncodedAccount, owner: string, disc: Uint8Array) => {
  if (acc.owner !== owner) throw new Error(`owner ${acc.owner} != ${owner}`);
  if (!disc.every((b, i) => acc.data[i] === b)) throw new Error("discriminator mismatch");
};
const s = (v: unknown) => (typeof v === "string" ? v : null);
void b58;

export const DRIFT_PROGRAM = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";
export const DRIFT_STATE_PDA = findProgramAddress([utf8("drift_state")], DRIFT_PROGRAM)[0];
export const driftAdapter: ProtocolAdapter = {
  slug: "drift",
  accounts: () => [DRIFT_STATE_PDA],
  decode(acc): AdminFacts {
    check(acc, DRIFT_PROGRAM, accountDiscriminator("State"));
    const f = decodePrefix(acc.data, DRIFT_STATE, NO_TYPES);
    return { account: acc.address, adapter: "drift:State", admin: s(f.admin), guardian: null, listingAuthority: s(f.admin), params: { signer: f.signer ?? null, whitelistMint: f.whitelistMint ?? null }, oracles: [], mints: [] };
  },
};

export const KAMINO_PROGRAM = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
/** Kamino "Main" lending market — https://github.com/Kamino-Finance/klend-sdk (verified onchain: owner + discriminator). */
export const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
export const kaminoAdapter: ProtocolAdapter = {
  slug: "kamino-lend",
  accounts: () => [KAMINO_MAIN_MARKET],
  decode(acc): AdminFacts {
    check(acc, KAMINO_PROGRAM, accountDiscriminator("LendingMarket"));
    const f = decodePrefix(acc.data, KAMINO_LENDING_MARKET, NO_TYPES);
    return {
      account: acc.address, adapter: "kamino:LendingMarket", admin: s(f.lendingMarketOwner), guardian: null, listingAuthority: s(f.lendingMarketOwner),
      params: { emergencyMode: f.emergencyMode === 1, borrowDisabled: f.borrowDisabled === 1, autodeleverageEnabled: f.autodeleverageEnabled === 1, referralFeeBps: f.referralFeeBps ?? null, globalAllowedBorrowValue: f.globalAllowedBorrowValue ?? null, pendingOwner: f.lendingMarketOwnerCached !== f.lendingMarketOwner ? s(f.lendingMarketOwnerCached) : null },
      oracles: [], mints: [],
    };
  },
};

export const MARGINFI_PROGRAM = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
/** marginfi main group — https://docs.marginfi.com (verified onchain: owner + IDL discriminator). */
export const MARGINFI_MAIN_GROUP = "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8";
export const marginfiAdapter: ProtocolAdapter = {
  slug: "marginfi",
  accounts: () => [MARGINFI_MAIN_GROUP],
  decode(acc): AdminFacts {
    check(acc, MARGINFI_PROGRAM, Uint8Array.from([182, 23, 173, 240, 151, 206, 182, 67]));
    const f = decodePrefix(acc.data, MARGINFI_GROUP, NO_TYPES);
    return { account: acc.address, adapter: "marginfi:MarginfiGroup", admin: s(f.admin), guardian: null, listingAuthority: s(f.admin), params: { groupFlags: f.group_flags ?? null }, oracles: [], mints: [] };
  },
};

export const ORCA_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
/** Orca main WhirlpoolsConfig — https://dev.orca.so (verified onchain: owner + IDL discriminator). */
export const ORCA_CONFIG = "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";
export const orcaAdapter: ProtocolAdapter = {
  slug: "orca",
  accounts: () => [ORCA_CONFIG],
  decode(acc): AdminFacts {
    check(acc, ORCA_PROGRAM, Uint8Array.from([157, 20, 49, 224, 217, 87, 193, 254]));
    const f = decodePrefix(acc.data, ORCA_WHIRLPOOLS_CONFIG, NO_TYPES);
    return { account: acc.address, adapter: "orca:WhirlpoolsConfig", admin: s(f.fee_authority), guardian: s(f.reward_emissions_super_authority), listingAuthority: null, params: { collectProtocolFeesAuthority: f.collect_protocol_fees_authority ?? null, defaultProtocolFeeRate: f.default_protocol_fee_rate ?? null }, oracles: [], mints: [] };
  },
};

for (const a of [driftAdapter, kaminoAdapter, marginfiAdapter, orcaAdapter]) registerAdapter(a);
