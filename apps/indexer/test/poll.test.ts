import { describe, expect, it } from "vitest";
import type { RawAccount } from "@overwatch/solana";
import {
  AccountSweeper,
  PROGRAMDATA_HEADER,
  fingerprint,
  pollAddress,
  type AccountKind,
  type Cursor,
  type CursorStore,
  type SignatureInfo,
} from "../src/poll";

/** An account with the given bytes. */
const account = (address: string, data: number[], owner = "Owner111"): RawAccount => ({
  address,
  owner,
  lamports: 1,
  executable: false,
  data: Uint8Array.from(data),
});

/** An 82-byte SPL mint whose supply bytes (36..44) are all `supply`. */
function mint(supply: number, freezeByte = 0): number[] {
  const bytes = new Array<number>(82).fill(0);
  bytes.fill(supply, 36, 44);
  bytes[50] = freezeByte;
  return bytes;
}

describe("fingerprint", () => {
  it("ignores mint supply but not authority bytes", () => {
    const base = fingerprint("mint", account("M", mint(1)));
    expect(fingerprint("mint", account("M", mint(9)))).toBe(base);
    expect(fingerprint("mint", account("M", mint(1, 5)))).not.toBe(base);
  });

  it("only looks at an oracle's owner", () => {
    const base = fingerprint("oracle", account("O", [1, 2, 3]));
    expect(fingerprint("oracle", account("O", [9, 9, 9]))).toBe(base);
    expect(fingerprint("oracle", account("O", [1, 2, 3], "OtherProgram"))).not.toBe(base);
  });

  it("tells a missing account apart from an existing one", () => {
    expect(fingerprint("other", null)).toBe("missing");
    expect(fingerprint("other", account("A", []))).not.toBe("missing");
  });
});

describe("AccountSweeper", () => {
  it("records on first sight, then reports only real changes", async () => {
    const state: Record<string, RawAccount | null> = { A: account("A", [1]), M: account("M", mint(1)) };
    const slices: unknown[] = [];
    const rpc = {
      async getMultipleAccounts(addresses: string[], slice?: { offset: number; length: number }) {
        slices.push(slice);
        return addresses.map((a) => state[a] ?? null);
      },
    };
    const kinds = new Map<string, AccountKind>([
      ["A", "other"],
      ["M", "mint"],
    ]);
    const sweeper = new AccountSweeper();

    expect(await sweeper.sweep(rpc, kinds)).toEqual([]);
    state.M = account("M", mint(7)); // supply moved: not a control change
    expect(await sweeper.sweep(rpc, kinds)).toEqual([]);
    state.A = account("A", [2]);
    expect(await sweeper.sweep(rpc, kinds)).toEqual(["A"]);
    state.A = null; // closed
    expect(await sweeper.sweep(rpc, kinds)).toEqual(["A"]);
    expect(slices.every((s) => s === undefined)).toBe(true);
  });

  it("reads ProgramData with a header slice", async () => {
    const slices: unknown[] = [];
    const rpc = {
      async getMultipleAccounts(addresses: string[], slice?: { offset: number; length: number }) {
        slices.push(slice);
        return addresses.map((a) => account(a, [0]));
      },
    };
    await new AccountSweeper().sweep(rpc, new Map([["P", "programdata" as const]]));
    expect(slices).toEqual([PROGRAMDATA_HEADER]);
  });
});

/** A fake chain: `history` is newest first, like getSignaturesForAddress returns it. */
function fakeChain(history: SignatureInfo[], slot = 1_000) {
  return {
    calls: 0,
    async getSlot() {
      return slot;
    },
    async getSignaturesForAddress(_address: string, opts: { before?: string; until?: string; limit?: number }) {
      this.calls++;
      const start = opts.before ? history.findIndex((s) => s.signature === opts.before) + 1 : 0;
      const untilIndex = opts.until ? history.findIndex((s) => s.signature === opts.until) : -1;
      const end = untilIndex === -1 ? history.length : untilIndex;
      return history.slice(start, end).slice(0, opts.limit ?? 1000);
    },
  };
}

/** A Map-backed cursor store; `cursors` maps address to the cursor's signature for easy assertions. */
function memoryStore() {
  const full = new Map<string, Cursor>();
  const cursors = new Map<string, string | null>();
  const store: CursorStore & { cursors: typeof cursors } = {
    cursors,
    async get(network, address) {
      return full.get(`${network}:${address}`) ?? null;
    },
    async set(network, address, cursor) {
      full.set(`${network}:${address}`, cursor);
      cursors.set(`${network}:${address}`, cursor.signature);
    },
  };
  return store;
}

// Signatures s1 (oldest) … sN (newest), returned newest first.
const sigs = (n: number): SignatureInfo[] =>
  Array.from({ length: n }, (_, i) => ({ signature: `s${n - i}`, slot: n - i, err: null }));

describe("pollAddress", () => {
  it("starts from now the first time, without replaying old history", async () => {
    const store = memoryStore();
    const seen: string[] = [];
    const r = await pollAddress(fakeChain(sigs(5)), store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(r.processed).toBe(0);
    expect(seen).toEqual([]);
    expect(store.cursors.get("mainnet:X")).toBe("s5");
  });

  it("replays everything after the cursor, oldest first", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: "s2", slot: 2 });
    const seen: string[] = [];
    await pollAddress(fakeChain(sigs(5)), store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(seen).toEqual(["s3", "s4", "s5"]);
    expect(store.cursors.get("mainnet:X")).toBe("s5");
  });

  it("pages through a long outage", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: "s1", slot: 1 });
    const seen: string[] = [];
    const chain = fakeChain(sigs(2501));
    const r = await pollAddress(chain, store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(r).toEqual({ processed: 2500, truncated: false });
    expect(seen[0]).toBe("s2");
    expect(seen.at(-1)).toBe("s2501");
    expect(chain.calls).toBe(3);
  });

  it("stops after maxPages and says so", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: "s1", slot: 1 });
    const r = await pollAddress(fakeChain(sigs(3001)), store, "mainnet", "X", async () => {}, 2);
    expect(r).toEqual({ processed: 2000, truncated: true });
    expect(store.cursors.get("mainnet:X")).toBe("s3001");
  });

  it("keeps the cursor on a failed transaction so it is retried", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: "s1", slot: 1 });
    const chain = fakeChain(sigs(4));
    const failOn = (s: SignatureInfo) => {
      if (s.signature === "s3") throw new Error("rpc hiccup");
      return Promise.resolve();
    };
    await expect(pollAddress(chain, store, "mainnet", "X", failOn)).rejects.toThrow("rpc hiccup");
    expect(store.cursors.get("mainnet:X")).toBe("s2");
    // Next poll succeeds and picks up from s3.
    const seen: string[] = [];
    await pollAddress(chain, store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(seen).toEqual(["s3", "s4"]);
  });

  it("does nothing when there is nothing new", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: "s5", slot: 5 });
    const r = await pollAddress(fakeChain(sigs(5)), store, "mainnet", "X", async () => {});
    expect(r).toEqual({ processed: 0, truncated: false });
  });

  it("catches the first transaction of an address that had no history", async () => {
    const store = memoryStore();
    const chain = fakeChain([], 100);
    await pollAddress(chain, store, "mainnet", "X", async () => {});
    expect(await store.get("mainnet", "X")).toEqual({ signature: null, slot: 100 });
    // Later the address makes its first transactions, at slots 101 and 102.
    const later = fakeChain([
      { signature: "n2", slot: 102 },
      { signature: "n1", slot: 101 },
    ]);
    const seen: string[] = [];
    await pollAddress(later, store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(seen).toEqual(["n1", "n2"]);
    expect(store.cursors.get("mainnet:X")).toBe("n2");
  });

  it("with a slot-only cursor, ignores transactions from before watching started", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: null, slot: 100 });
    // A shallow endpoint suddenly shows older history alongside one new transaction.
    const chain = fakeChain([
      { signature: "new", slot: 150 },
      { signature: "old", slot: 50 },
    ]);
    const seen: string[] = [];
    await pollAddress(chain, store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(seen).toEqual(["new"]);
  });

  it("upgrades a slot-only cursor once older history shows up", async () => {
    const store = memoryStore();
    await store.set("mainnet", "X", { signature: null, slot: 100 });
    const chain = fakeChain([{ signature: "old", slot: 50 }]);
    const seen: string[] = [];
    await pollAddress(chain, store, "mainnet", "X", async (s) => void seen.push(s.signature));
    expect(seen).toEqual([]);
    expect(await store.get("mainnet", "X")).toEqual({ signature: "old", slot: 50 });
  });
});
