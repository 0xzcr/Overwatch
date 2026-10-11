/** Read-only registry helpers (no web3.js dependency). */
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";

export const REGISTRY_PROGRAM_ID = "ZCq8qg8ALrZp4FtKra2FERRREWU8c5bu75EQ9CR3q1X";
export const VAULT_PROGRAM_ID = "9HyNZKXgyJzCoSq3PQ16etGn7eC4ZDauTuRUUe9Jef5A";
export const RISK_RECORD_DISCRIMINATOR = Uint8Array.from([204, 225, 214, 255, 142, 124, 214, 45]);
export const GRADES = ["A", "B", "C", "D", "F"] as const;
export const RED_MASK = (1n << 0n) | (1n << 4n) | (1n << 10n) | (1n << 11n);

const enc = new TextEncoder();
export const protocolIdBytes = (slug: string) => sha256(enc.encode(slug));

function onCurve(b: Uint8Array) {
  try { ed25519.ExtendedPoint.fromHex(b); return true; } catch { return false; }
}
export function findPda(seeds: Uint8Array[], programId: string): [string, number] {
  const pid = bs58.decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), pid, enc.encode("ProgramDerivedAddress")];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = sha256(buf);
    if (!onCurve(h)) return [bs58.encode(h), bump];
  }
  throw new Error("no bump");
}

export const configPda = (programId = REGISTRY_PROGRAM_ID) => findPda([enc.encode("config")], programId)[0];
export const riskPda = (slug: string, programId = REGISTRY_PROGRAM_ID) => findPda([enc.encode("risk"), protocolIdBytes(slug)], programId)[0];

export interface RiskRecord {
  protocolId: Uint8Array; score: number; grade: (typeof GRADES)[number]; flags: bigint; lastEventSlot: bigint;
  updatedSlot: bigint; publisher: string; version: number; red: boolean;
}

export function decodeRiskRecord(data: Uint8Array): RiskRecord {
  if (data.length < 8 + 32 + 2 + 24 + 32 + 4 + 1 || !RISK_RECORD_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error("not a RiskRecord");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const flags = dv.getBigUint64(42, true);
  return {
    protocolId: data.slice(8, 40), score: data[40]!, grade: GRADES[data[41]!] ?? "F", flags,
    lastEventSlot: dv.getBigUint64(50, true), updatedSlot: dv.getBigUint64(58, true),
    publisher: bs58.encode(data.subarray(66, 98)), version: dv.getUint32(98, true), red: (flags & RED_MASK) !== 0n,
  };
}

/** Fetch & decode a protocol's RiskRecord from any RPC (verifies owner). */
export async function fetchRiskRecord(rpcUrl: string, slug: string, programId = REGISTRY_PROGRAM_ID): Promise<RiskRecord | null> {
  const address = riskPda(slug, programId);
  const r = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64" }] }) });
  const j = (await r.json()) as { result?: { value: { owner: string; data: [string, string] } | null } };
  const v = j.result?.value;
  if (!v) return null;
  if (v.owner !== programId) throw new Error(`RiskRecord owner mismatch: ${v.owner}`);
  return decodeRiskRecord(Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0)));
}
