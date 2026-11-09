/**
 * Polling: the indexer's source of truth. It works against any Solana RPC endpoint and never misses a change
 * silently, unlike websockets, which can drop without anyone noticing.
 *
 * - `AccountSweeper` reads every watched account in batches and reports the ones whose meaningful bytes changed.
 * - `pollAddress` fetches the transactions that mention an address since a saved cursor, oldest first, so a
 *   restart replays everything that happened while the indexer was down.
 *
 * Both take their RPC and storage as arguments so they can be tested without a network or a database.
 */
import { createHash } from "node:crypto";
import type { RawAccount } from "@overwatch/solana";

/** What kind of account a watched address is. It decides which bytes count as a real change. */
export type AccountKind = "programdata" | "mint" | "oracle" | "other";

// ProgramData header: 4-byte tag, 8-byte deploy slot, then the optional 33-byte upgrade authority.
// A program upgrade changes the slot and an authority change changes the authority, so 45 bytes catch both
// without downloading the whole program binary (which can be megabytes) on every sweep.
export const PROGRAMDATA_HEADER = { offset: 0, length: 45 };

// SPL mint layout: bytes 36..44 hold the supply, which changes on every mint and burn and says nothing
// about who controls the token, so those bytes are left out of the fingerprint.
const MINT_SUPPLY_START = 36;
const MINT_SUPPLY_END = 44;

/** A short hash of the parts of an account that matter for control. Missing accounts get their own value. */
export function fingerprint(kind: AccountKind, account: RawAccount | null): string {
  if (!account) return "missing";
  // Overwatch only records an oracle's owner program, so price updates must not count as changes.
  if (kind === "oracle") return `owner:${account.owner}`;
  let bytes = account.data;
  if (kind === "mint") {
    const before = bytes.subarray(0, MINT_SUPPLY_START);
    const after = bytes.subarray(MINT_SUPPLY_END);
    bytes = Buffer.concat([before, after]);
  }
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  return `${account.owner}:${hash}`;
}

/** The RPC calls the sweeper needs (a subset of `Rpc`, so tests can pass a fake). */
export interface AccountReader {
  getMultipleAccounts(addresses: string[], slice?: { offset: number; length: number }): Promise<(RawAccount | null)[]>;
}

/** Remembers each account's fingerprint between sweeps and reports which ones changed. */
export class AccountSweeper {
  private seen = new Map<string, string>();

  /**
   * Reads every account once and returns the addresses whose fingerprint changed since the last sweep.
   * The first time an address is seen it is only recorded: the startup reconcile already reads current state.
   */
  async sweep(rpc: AccountReader, accounts: Map<string, AccountKind>): Promise<string[]> {
    // ProgramData accounts are read with a header slice; everything else is read in full.
    const headerOnly: string[] = [];
    const full: string[] = [];
    for (const [address, kind] of accounts) {
      if (kind === "programdata") headerOnly.push(address);
      else full.push(address);
    }
    const headerAccounts = headerOnly.length ? await rpc.getMultipleAccounts(headerOnly, PROGRAMDATA_HEADER) : [];
    const fullAccounts = full.length ? await rpc.getMultipleAccounts(full) : [];

    const addresses = [...headerOnly, ...full];
    const results = [...headerAccounts, ...fullAccounts];
    const changed: string[] = [];
    addresses.forEach((address, i) => {
      const next = fingerprint(accounts.get(address)!, results[i] ?? null);
      const previous = this.seen.get(address);
      this.seen.set(address, next);
      if (previous !== undefined && previous !== next) changed.push(address);
    });
    return changed;
  }
}

/** One entry from `getSignaturesForAddress`. */
export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime?: number | null;
  err?: unknown;
}

/** The RPC calls the address poller needs (a subset of `Rpc`). */
export interface SignatureReader {
  getSignaturesForAddress(
    address: string,
    opts: { before?: string; until?: string; limit?: number },
    fromSlot?: number,
  ): Promise<SignatureInfo[]>;
  getSlot(): Promise<number>;
}

/**
 * How far we have read for one address: the last transaction processed, or, for an address with no visible
 * history yet, no signature and the slot we started watching at.
 */
export interface Cursor {
  signature: string | null;
  slot: number;
}

/** Where cursors are saved. The indexer uses the `signature_cursors` table; tests use a Map. */
export interface CursorStore {
  get(network: string, address: string): Promise<Cursor | null>;
  set(network: string, address: string, cursor: Cursor): Promise<void>;
}

// getSignaturesForAddress returns at most 1000 entries per call.
const PAGE_SIZE = 1000;

/**
 * Hands every transaction that mentions `address` since the saved cursor to `onSignature`, oldest first, and
 * moves the cursor forward after each one. If `onSignature` throws, the cursor stays put and that transaction is
 * retried on the next poll, so nothing is skipped because of a temporary RPC failure.
 *
 * After a long outage, at most `maxPages` pages are replayed (`truncated` is then true) so one very busy address
 * cannot stall the indexer.
 */
export async function pollAddress(
  rpc: SignatureReader,
  store: CursorStore,
  network: string,
  address: string,
  onSignature: (sig: SignatureInfo) => Promise<void>,
  maxPages = 10,
): Promise<{ processed: number; truncated: boolean }> {
  const cursor = await store.get(network, address);

  if (!cursor) {
    // First time this address is watched: start from now, because there is no gap to fill yet.
    // With no visible history (a quiet address, or an endpoint that keeps only recent history), remember the
    // current slot instead, so the address's next transaction is still processed rather than taken as the start.
    const now = await rpc.getSlot();
    const [newest] = await rpc.getSignaturesForAddress(address, { limit: 1 }, now);
    const start = newest ? { signature: newest.signature, slot: newest.slot } : { signature: null, slot: now };
    await store.set(network, address, start);
    return { processed: 0, truncated: false };
  }

  // Page backwards from the newest transaction until the RPC reaches the cursor.
  // Without a cursor signature there is nothing to stop at, so pages are read until they pass the start slot.
  const until = cursor.signature ?? undefined;
  const pages: SignatureInfo[][] = [];
  let before: string | undefined;
  let truncated = false;
  for (let page = 0; ; page++) {
    if (page === maxPages) {
      truncated = true;
      break;
    }
    // Only endpoints whose history reaches back to the cursor can answer this, so nothing between is skipped.
    const batch = await rpc.getSignaturesForAddress(address, { until, before, limit: PAGE_SIZE }, cursor.slot);
    pages.push(batch);
    const oldest = batch[batch.length - 1];
    if (batch.length < PAGE_SIZE || (!until && oldest!.slot <= cursor.slot)) break;
    before = oldest!.signature;
  }

  // Pages arrive newest first; process oldest first so the cursor only ever moves forward.
  // With a slot-only cursor, keep just the transactions after the slot we started watching at.
  const all = pages.flat().reverse();
  const fresh = until ? all : all.filter((sig) => sig.slot > cursor.slot);
  for (const sig of fresh) {
    await onSignature(sig);
    await store.set(network, address, { signature: sig.signature, slot: sig.slot });
  }
  // A slot-only cursor that now sees only older history (an archive endpoint answered this time) can switch to
  // that history's newest signature: everything up to it predates watching, so nothing is skipped.
  const newest = all[all.length - 1];
  if (!until && newest && fresh.length === 0) {
    await store.set(network, address, { signature: newest.signature, slot: newest.slot });
  }
  return { processed: fresh.length, truncated };
}
