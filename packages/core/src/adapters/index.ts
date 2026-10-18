import type { AdminFacts } from "../types";

export interface EncodedAccount {
  address: string;
  owner: string;
  data: Uint8Array;
}

/** Per-protocol admin-config decoder. Adapters must be verified against real account bytes (see fixtures/). */
export interface ProtocolAdapter {
  slug: string;
  /** admin/config accounts to watch */
  accounts(): string[];
  decode(acc: EncodedAccount): AdminFacts;
}

export const adapters = new Map<string, ProtocolAdapter>();
export function registerAdapter(a: ProtocolAdapter) {
  adapters.set(a.slug, a);
}
