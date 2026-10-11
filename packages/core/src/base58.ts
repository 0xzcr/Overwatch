import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";

export const encode = (b: Uint8Array) => bs58.encode(b);
export const decode = (s: string) => bs58.decode(s);
export const DEFAULT_PUBKEY = "11111111111111111111111111111111";

export function readPubkey(data: Uint8Array, offset: number): string {
  if (data.length < offset + 32) throw new Error(`buffer too short for pubkey at ${offset}`);
  return bs58.encode(data.subarray(offset, offset + 32));
}

export function isOnCurve(address: string): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bs58.decode(address));
    return true;
  } catch {
    return false;
  }
}

/** Solana findProgramAddress, implemented natively (no web3.js). */
export function findProgramAddress(seeds: Uint8Array[], programId: string): [string, number] {
  const pid = bs58.decode(programId);
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), pid, marker];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const h = sha256(buf);
    const addr = bs58.encode(h);
    if (!isOnCurve(addr)) return [addr, bump];
  }
  throw new Error("no viable bump");
}

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const protocolId = (slug: string) => sha256(utf8(slug));
