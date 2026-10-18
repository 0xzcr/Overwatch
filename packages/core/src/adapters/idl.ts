import { sha256 } from "@noble/hashes/sha256";
import { encode } from "../base58";

/** Minimal Anchor IDL type model (legacy + 0.30 spec) for decoding the fixed-size prefix of an account. */
export type IdlType =
  | string
  | { array: [IdlType, number] }
  | { defined: string | { name: string } }
  | { option: IdlType }
  | { vec: IdlType };
export interface IdlField {
  name: string;
  type: IdlType;
}
export interface IdlTypeDef {
  name: string;
  type: { kind: "struct"; fields?: IdlField[] } | { kind: "enum"; variants: { name: string; fields?: unknown[] }[] };
}

const PRIM: Record<string, number> = {
  u8: 1,
  i8: 1,
  bool: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  u64: 8,
  i64: 8,
  f64: 8,
  u128: 16,
  i128: 16,
  publicKey: 32,
  pubkey: 32,
};

export function sizeOf(t: IdlType, types: IdlTypeDef[]): number | null {
  if (typeof t === "string") return PRIM[t] ?? null;
  if ("array" in t) {
    const s = sizeOf(t.array[0], types);
    return s == null ? null : s * t.array[1];
  }
  if ("defined" in t) {
    const name = typeof t.defined === "string" ? t.defined : t.defined.name;
    const def = types.find((x) => x.name === name);
    if (!def) return null;
    if (def.type.kind === "enum") return def.type.variants.every((v) => !v.fields?.length) ? 1 : null;
    let n = 0;
    for (const f of def.type.fields ?? []) {
      const s = sizeOf(f.type, types);
      if (s == null) return null;
      n += s;
    }
    return n;
  }
  return null; // option / vec are variable-size
}

export type Value = string | number | boolean | null;

/** Decodes leading fields until the first variable-size field. Pod/zero-copy and borsh layouts are sequential here. */
export function decodePrefix(
  data: Uint8Array,
  fields: IdlField[],
  types: IdlTypeDef[],
  offset = 8,
): Record<string, Value> {
  const out: Record<string, Value> = {};
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = offset;
  for (const f of fields) {
    const s = sizeOf(f.type, types);
    if (s == null || o + s > data.length) break;
    const t = f.type;
    if (t === "publicKey" || t === "pubkey") out[f.name] = encode(data.subarray(o, o + 32));
    else if (t === "u8") out[f.name] = data[o]!;
    else if (t === "bool") out[f.name] = data[o] === 1;
    else if (t === "u16") out[f.name] = dv.getUint16(o, true);
    else if (t === "u32") out[f.name] = dv.getUint32(o, true);
    else if (t === "u64") out[f.name] = dv.getBigUint64(o, true).toString();
    else if (t === "i64") out[f.name] = dv.getBigInt64(o, true).toString();
    o += s;
  }
  return out;
}

export const accountDiscriminator = (name: string) => sha256(new TextEncoder().encode(`account:${name}`)).slice(0, 8);
