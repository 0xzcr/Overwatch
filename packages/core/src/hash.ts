import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { ControlSnapshot } from "./types";

const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;

/** Content hash ignores slot/time so identical control state isn't re-stored. */
export function snapshotHash(s: ControlSnapshot): string {
  const { slot: _s, takenAt: _t, ...rest } = s;
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(rest)))));
}
