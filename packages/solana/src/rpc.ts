import { z } from "zod";

/** Minimal JSON-RPC client with timeouts, retry/backoff and 429 handling. Read-only by design. */
export interface RpcOptions {
  url: string;
  /** Extra endpoints to fail over to, from any provider. `url` is tried first. */
  fallbackUrls?: string[];
  timeoutMs?: number;
  maxRetries?: number;
  /** minimum ms between requests (simple client-side rate limit) */
  minIntervalMs?: number;
}

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown,
  ) {
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

// After an endpoint fails, prefer the others for this long, then try it again (it is usually the best one).
const COOLDOWN_MS = 60_000;
// How far back an endpoint's history reaches moves forward as it prunes, so it is re-checked this often.
const DEPTH_TTL_MS = 10 * 60_000;

interface Endpoint {
  url: string;
  /** When this endpoint last failed with a timeout, 429 or 5xx (0 = never). */
  failedAt: number;
  /**
   * The oldest slot this endpoint has transaction history for (`getFirstAvailableBlock`): 0 for a full archive,
   * a recent slot for nodes that keep only a few days, Infinity if it serves no history. Undefined until checked.
   */
  firstSlot: number | undefined;
  depthCheckedAt: number;
}

export class Rpc {
  private last = 0;
  private id = 0;
  // Every endpoint we may use, in order of preference.
  private endpoints: Endpoint[];
  constructor(private opts: RpcOptions) {
    const urls = [opts.url, ...(opts.fallbackUrls ?? [])];
    this.endpoints = urls.map((url) => ({ url, failedAt: 0, firstSlot: undefined, depthCheckedAt: 0 }));
  }

  /** The preferred endpoint. */
  get url() {
    return this.endpoints[0]!.url;
  }

  /**
   * The endpoint for the next request: the first candidate that has not failed recently, or, when all of them
   * have, the one that failed longest ago. `skip` holds endpoints that already refused this request.
   *
   * Ordinary requests take candidates in list order. History requests (`fromSlot` set) only consider endpoints
   * whose history reaches back to `fromSlot`, shallowest first: a node that keeps a few days answers in a fraction
   * of a second, while a full archive may take many seconds per lookup, so the archive is used only when needed.
   */
  private pick(fromSlot: number | undefined, skip: Set<string>): Endpoint | undefined {
    const usable = this.endpoints.filter((e) => !skip.has(e.url));
    const reaching = usable.filter((e) => e.firstSlot !== undefined && e.firstSlot <= fromSlot!);
    // Array.sort is stable, so endpoints with the same depth keep their list order.
    const candidates = fromSlot === undefined ? usable : reaching.sort((a, b) => b.firstSlot! - a.firstSlot!);
    const rested = candidates.find((e) => Date.now() - e.failedAt > COOLDOWN_MS);
    return rested ?? [...candidates].sort((a, b) => a.failedAt - b.failedAt)[0];
  }

  /** One request to one endpoint, no retries. JSON-RPC errors are marked `fatal` (retrying the same call won't help). */
  private async send<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const wait = (this.opts.minIntervalMs ?? 0) - (Date.now() - this.last);
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(url, {
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
        throw Object.assign(new RpcError(json.error.message, json.error.code, json.error.data), { fatal: true });
      }
      return json.result as T;
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Asks each endpoint how far back its transaction history goes. Endpoints differ a lot (publicnode keeps about
   * three days, api.mainnet-beta keeps everything), and a node asked about a transaction older than its history
   * answers with an empty list rather than an error, which would look like "nothing happened". A check that fails
   * (429, timeout) leaves the endpoint unknown, and it is checked again on the next history call.
   */
  private async checkDepths() {
    const stale = this.endpoints.filter((e) => Date.now() - e.depthCheckedAt > DEPTH_TTL_MS);
    for (const e of stale) {
      try {
        e.firstSlot = await this.send<number>(e.url, "getFirstAvailableBlock", []);
        e.depthCheckedAt = Date.now();
      } catch (err) {
        // A refusal means the endpoint serves no history; anything else is retried on the next history call.
        if ((err as { fatal?: boolean }).fatal) {
          e.firstSlot = Infinity;
          e.depthCheckedAt = Date.now();
        }
      }
    }
  }

  /**
   * Sends a request with failover. Pass `fromSlot` for a history request: it then only goes to endpoints whose
   * history reaches back to that slot.
   */
  async call<T = unknown>(method: string, params: unknown[] = [], fromSlot?: number): Promise<T> {
    if (fromSlot !== undefined) await this.checkDepths();
    const max = this.opts.maxRetries ?? 5;
    let attempt = 0;
    // Endpoints that refused this request outright (for example a provider that blocks getProgramAccounts).
    const refused = new Set<string>();
    const none =
      fromSlot === undefined ? "no endpoint" : `no endpoint has transaction history back to slot ${fromSlot}`;
    let lastError: unknown = new RpcError(none);
    for (;;) {
      const endpoint = this.pick(fromSlot, refused);
      if (!endpoint) throw lastError;
      try {
        return await this.send<T>(endpoint.url, method, params);
      } catch (e) {
        lastError = e;
        if ((e as { fatal?: boolean }).fatal) {
          // A refusal can be one provider's policy, so give every other endpoint one chance before giving up.
          refused.add(endpoint.url);
          continue;
        }
        if (attempt >= max) throw e;
        // Timeouts, 429s and 5xx: rest this endpoint so the next attempt goes elsewhere, then back off.
        endpoint.failedAt = Date.now();
        const is429 = e instanceof RpcError && e.code === 429;
        await sleep(Math.min(30_000, (is429 ? 1500 : 400) * 2 ** attempt + Math.random() * 250));
        attempt++;
      }
    }
  }

  async getSlot(): Promise<number> {
    return z.number().parse(await this.call("getSlot", [{ commitment: "confirmed" }]));
  }

  async getAccount(address: string, slice?: { offset: number; length: number }): Promise<RawAccount | null> {
    const r = withCtx(accountInfoSchema.nullable()).parse(
      await this.call("getAccountInfo", [
        address,
        { encoding: "base64", commitment: "confirmed", ...(slice ? { dataSlice: slice } : {}) },
      ]),
    );
    return r.value ? toRaw(address, r.value) : null;
  }

  /** Batched getMultipleAccounts (max 100 per call). */
  async getMultipleAccounts(
    addresses: string[],
    slice?: { offset: number; length: number },
  ): Promise<(RawAccount | null)[]> {
    const out: (RawAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const chunk = addresses.slice(i, i + 100);
      const r = withCtx(z.array(accountInfoSchema.nullable())).parse(
        await this.call("getMultipleAccounts", [
          chunk,
          { encoding: "base64", commitment: "confirmed", ...(slice ? { dataSlice: slice } : {}) },
        ]),
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
      .parse(
        await this.call("getProgramAccounts", [
          program,
          { encoding: "base64", commitment: "confirmed", filters, ...(slice ? { dataSlice: slice } : {}) },
        ]),
      );
    return r.map((x) => toRaw(x.pubkey, x.account));
  }

  /**
   * Transactions mentioning `address`, newest first. `fromSlot` is the oldest slot the answer must cover; the
   * default (0) uses only full archives, and a recent slot lets faster endpoints with shorter history answer.
   */
  async getSignaturesForAddress(
    address: string,
    opts: { before?: string; until?: string; limit?: number } = {},
    fromSlot = 0,
  ) {
    return z
      .array(
        z.object({
          signature: z.string(),
          slot: z.number(),
          blockTime: z.number().nullable().optional(),
          err: z.unknown(),
        }),
      )
      .parse(
        await this.call(
          "getSignaturesForAddress",
          [address, { limit: 1000, ...opts, commitment: "confirmed" }],
          fromSlot,
        ),
      );
  }

  /** One transaction. Pass its `slot` when known so an endpoint with shorter history can answer. */
  async getTransaction(signature: string, slot = 0): Promise<ParsedTx | null> {
    const r = await this.call(
      "getTransaction",
      [signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
      slot,
    );
    return r ? txSchema.parse(r) : null;
  }
}

export const txSchema = z.object({
  slot: z.number(),
  blockTime: z.number().nullable().optional(),
  meta: z
    .object({
      err: z.unknown(),
      loadedAddresses: z.object({ writable: z.array(z.string()), readonly: z.array(z.string()) }).optional(),
    })
    .nullable(),
  transaction: z.object({
    signatures: z.array(z.string()),
    message: z.object({
      accountKeys: z.array(z.string()),
      header: z.object({
        numRequiredSignatures: z.number(),
        numReadonlySignedAccounts: z.number(),
        numReadonlyUnsignedAccounts: z.number(),
      }),
      instructions: z.array(z.object({ programIdIndex: z.number(), accounts: z.array(z.number()), data: z.string() })),
      recentBlockhash: z.string(),
    }),
  }),
});
export type ParsedTx = z.infer<typeof txSchema>;

function toRaw(address: string, v: z.infer<typeof accountInfoSchema>): RawAccount {
  return {
    address,
    owner: v.owner,
    lamports: v.lamports,
    executable: v.executable,
    data: Uint8Array.from(Buffer.from(v.data[0], "base64")),
  };
}

/**
 * Builds a client for one network from the environment, so no single provider is required:
 * - `<prefix>_RPC_URLS`: comma-separated endpoints from any providers, tried in order with failover.
 * - `<prefix>_RPC_URL`: a single endpoint (older setting, still honoured).
 * - `HELIUS_API_KEY`: a Helius endpoint, if nothing above is set.
 * - otherwise the public Solana endpoint.
 */
function rpcFromEnv(prefix: string, heliusHost: string, publicUrl: string): Rpc {
  const listed = (process.env[`${prefix}_RPC_URLS`] ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const key = process.env.HELIUS_API_KEY;
  const single = process.env[`${prefix}_RPC_URL`] || (key ? `https://${heliusHost}/?api-key=${key}` : publicUrl);
  const urls = listed.length ? listed : [single];
  // Only a lone Helius endpoint is known to allow fast requests; a list may include free endpoints that need pacing.
  const fast = !!key && !listed.length;
  return new Rpc({ url: urls[0]!, fallbackUrls: urls.slice(1), minIntervalMs: fast ? 20 : 120 });
}

export function mainnetRpc(): Rpc {
  return rpcFromEnv("SOLANA_MAINNET", "mainnet.helius-rpc.com", "https://api.mainnet-beta.solana.com");
}
export function devnetRpc(): Rpc {
  return rpcFromEnv("SOLANA_DEVNET", "devnet.helius-rpc.com", "https://api.devnet.solana.com");
}
