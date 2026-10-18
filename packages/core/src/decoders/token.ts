import { readPubkey, DEFAULT_PUBKEY } from "../base58";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../constants/programs";
import type { MintFacts } from "../types";

// Token-2022 ExtensionType discriminants — https://github.com/solana-program/token-2022/blob/main/program/src/extension/mod.rs
export const EXT: Record<number, string> = {
  1: "TransferFeeConfig",
  3: "MintCloseAuthority",
  4: "ConfidentialTransferMint",
  6: "DefaultAccountState",
  9: "NonTransferable",
  10: "InterestBearingConfig",
  12: "PermanentDelegate",
  14: "TransferHook",
  16: "ConfidentialTransferFeeConfig",
  18: "MetadataPointer",
  19: "TokenMetadata",
  20: "GroupPointer",
  21: "TokenGroup",
  22: "GroupMemberPointer",
  23: "TokenGroupMember",
  24: "ConfidentialMintBurn",
  25: "ScaledUiAmount",
  26: "Pausable",
};

const MINT_LEN = 82;
const ACCOUNT_TYPE_OFFSET = 165;

const optKey = (d: Uint8Array, off: number) => {
  const k = readPubkey(d, off);
  return k === DEFAULT_PUBKEY ? null : k;
};

export function decodeMint(address: string, owner: string, data: Uint8Array): MintFacts {
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM)
    throw new Error(`mint owner ${owner} is not a token program`);
  if (data.length < MINT_LEN) throw new Error("mint too short");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const facts: MintFacts = {
    address,
    tokenProgram: owner === TOKEN_PROGRAM ? "spl-token" : "token-2022",
    mintAuthority: dv.getUint32(0, true) ? readPubkey(data, 4) : null,
    freezeAuthority: dv.getUint32(46, true) ? readPubkey(data, 50) : null,
    permanentDelegate: null,
    transferHookProgram: null,
    defaultAccountStateFrozen: false,
    pausable: false,
    extensions: [],
  };
  if (owner !== TOKEN_2022_PROGRAM || data.length <= ACCOUNT_TYPE_OFFSET + 1) return facts;
  let o = ACCOUNT_TYPE_OFFSET + 1; // TLV region after account-type byte
  while (o + 4 <= data.length) {
    const type = dv.getUint16(o, true);
    const len = dv.getUint16(o + 2, true);
    const v = o + 4;
    if (type === 0) break; // Uninitialized padding
    facts.extensions.push(EXT[type] ?? `Unknown(${type})`);
    if (type === 12) facts.permanentDelegate = optKey(data, v);
    if (type === 14) facts.transferHookProgram = optKey(data, v + 32); // authority, program_id
    if (type === 6) facts.defaultAccountStateFrozen = data[v] === 2; // AccountState::Frozen
    if (type === 26) facts.pausable = true;
    o = v + len;
  }
  return facts;
}

export function mintRisks(m: MintFacts): string[] {
  const r: string[] = [];
  if (m.permanentDelegate) r.push("PermanentDelegate");
  if (m.transferHookProgram) r.push("TransferHook");
  if (m.defaultAccountStateFrozen) r.push("DefaultFrozen");
  if (m.freezeAuthority) r.push("FreezeAuthority");
  if (m.pausable) r.push("Pausable");
  return r;
}
