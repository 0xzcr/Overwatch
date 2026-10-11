import { z } from "zod";

/** Minimal JSON-RPC client with timeouts, retry/backoff and 429 handling. Read-only by design. */
export interface RpcOptions {
  url: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** minimum ms between requests (simple client-side rate limit) */
  minIntervalMs?: number;
}

export class RpcError extends Error {
  constructor(message: string, public code?: number, public data?: unknown) {
    super(message);
  }
}

const rpcResponse = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string()]),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const accountInfoSchema = z.object({
  data: z.tuple([z.string(), z.literal("base64")]),
  executable: z.boolean(),
  lamports: z.number(),
  owner: z.string(),
  space: z.number().optional(),
});
export type RawAccount = { address: string; owner: string; lamports: number; executable: boolean; data: Uint8Array };

const withCtx = <T extends z.ZodTypeAny>(v: T) => z.object({ context: z.object({ slot: z.number() }), value: v });

export class Rpc {
  private last = 0;
  private id = 0;
  constructor(private opts: RpcOptions) {}

  get url() {
    return this.opts.url;
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const max = this.opts.maxRetries ?? 5;
    let attempt = 0;
    for (;;) {
      const wait = (this.opts.minIntervalMs ?? 0) - (Date.now() - this.last);
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000);
      try {
        const res = await fetch(this.opts.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
          signal: ctrl.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          throw new RpcError(`HTTP ${res.status}`, res.status);
        }
        const json = rpcResponse.parse(await res.json());
        if (json.error) {
          // non-retryable JSON-RPC errors (bad params, method blocked) surface immediately
          throw Object.assign(new RpcError(json.error.message, json.error.code, json.error.data), { fatal: true });
        }
        return json.result as T;
      } catch (e) {
        const fatal = (e as { fatal?: boolean }).fatal;
        if (fatal || attempt >= max) throw e;
        const is429 = e instanceof RpcError && e.code === 429;
        await sleep(Math.min(30_000, (is429 ? 1500 : 400) * 2 ** attempt + Math.random() * 250));
        attempt++;
      } finally {
        clearTimeout(t);
      }
    }
  }

  async getSlot(): Promise<number> {
    return z.number().parse(await this.call("getSlot", [{ commitment: "confirmed" }]));
  }

  async getAccount(address: string, slice?: { offset: number; length: number }): Promise<RawAccount | null> {
    const r = withCtx(accountInfoSchema.nullable()).parse(
      await this.call("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed", ...(slice ? { dataSlice: slice } : {}) }]),
    );
    return r.value ? toRaw(address, r.value) : null;
  }

  /** Batched getMultipleAccounts (max 100 per call). */
  async getMultipleAccounts(addresses: string[], slice?: { offset: number; length: number }): Promise<(RawAccount | null)[]> {
    const out: (RawAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const chunk = addresses.slice(i, i + 100);
      const r = withCtx(z.array(accountInfoSchema.nullable())).parse(
        await this.call("getMultipleAccounts", [chunk, { encoding: "base64", commitment: "confirmed", ...(slice ? { dataSlice: slice } : {}) }]),
      );
      r.value.forEach((v, j) => out.push(v ? toRaw(chunk[j]!, v) : null));
    }
    return out;
  }

  async getProgramAccounts(
    program: string,
    filters: unknown[],
    slice?: { offset: number; length: number },
  ): Promise<RawAccount[]> {
    const r = z
      .array(z.object({ pubkey: z.string(), account: accountInfoSchema }))
      .parse(await this.call("getProgramAccounts", [program, { encoding: "base64", commitment: "confirmed", filters, ...(slice ? { dataSlice: slice } : {}) }]));
    return r.map((x) => toRaw(x.pubkey, x.account));
  }

  async getSignaturesForAddress(address: string, opts: { before?: string; limit?: number } = {}) {
    return z
      .array(z.object({ signature: z.string(), slot: z.number(), blockTime: z.number().nullable().optional(), err: z.unknown() }))
      .parse(await this.call("getSignaturesForAddress", [address, { limit: 1000, ...opts, commitment: "confirmed" }]));
  }

  async getTransaction(signature: string): Promise<ParsedTx | null> {
    const r = await this.call("getTransaction", [signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
    return r ? txSchema.parse(r) : null;
  }
}

export const txSchema = z.object({
  slot: z.number(),
  blockTime: z.number().nullable().optional(),
  meta: z.object({ err: z.unknown(), loadedAddresses: z.object({ writable: z.array(z.string()), readonly: z.array(z.string()) }).optional() }).nullable(),
  transaction: z.object({
    signatures: z.array(z.string()),
    message: z.object({
      accountKeys: z.array(z.string()),
      header: z.object({ numRequiredSignatures: z.number(), numReadonlySignedAccounts: z.number(), numReadonlyUnsignedAccounts: z.number() }),
      instructions: z.array(z.object({ programIdIndex: z.number(), accounts: z.array(z.number()), data: z.string() })),
      recentBlockhash: z.string(),
    }),
  }),
});
export type ParsedTx = z.infer<typeof txSchema>;

function toRaw(address: string, v: z.infer<typeof accountInfoSchema>): RawAccount {
  return { address, owner: v.owner, lamports: v.lamports, executable: v.executable, data: Uint8Array.from(Buffer.from(v.data[0], "base64")) };
}

export function mainnetRpc(): Rpc {
  const key = process.env.HELIUS_API_KEY;
  const url = process.env.SOLANA_MAINNET_RPC_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : "https://api.mainnet-beta.solana.com");
  return new Rpc({ url, minIntervalMs: key ? 20 : 120 });
}
export function devnetRpc(): Rpc {
  const key = process.env.HELIUS_API_KEY;
  const url = process.env.SOLANA_DEVNET_RPC_URL || (key ? `https://devnet.helius-rpc.com/?api-key=${key}` : "https://api.devnet.solana.com");
  return new Rpc({ url, minIntervalMs: key ? 20 : 120 });
}
