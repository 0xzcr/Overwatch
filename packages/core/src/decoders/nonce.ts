import { readPubkey } from "../base58";
import type { NonceFacts } from "../types";

export const NONCE_ACCOUNT_LEN = 80;
export const NONCE_AUTHORITY_OFFSET = 8;

/** System nonce account: u32 version, u32 state, authority@8, blockhash@40, u64 lamportsPerSignature@72. */
export function decodeNonce(address: string, data: Uint8Array): NonceFacts | null {
  if (data.length !== NONCE_ACCOUNT_LEN) throw new Error(`nonce account must be 80 bytes, got ${data.length}`);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const state = dv.getUint32(4, true);
  if (state !== 1) return null; // uninitialized
  return { address, authority: readPubkey(data, 8), blockhash: readPubkey(data, 40) };
}
