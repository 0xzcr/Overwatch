/**
 * Overwatch indexer: polling (source of truth) + optional websockets (early hints) + reconciler
 * → snapshots → rules → score → publish. Mainnet is read-only. Devnet is used only for the onchain registry.
 *
 * It needs no particular provider: give it any Solana RPC endpoints (SOLANA_MAINNET_RPC_URLS) and any Postgres.
 */
import "@overwatch/db/env";
import { createServer } from "node:http";
import bs58 from "bs58";
import { mainnetRpc, devnetRpc, WsSubscriptions, type Rpc } from "@overwatch/solana";
import {
  collectSnapshot,
  adapters,
  NONCE_ACCOUNT_LEN,
  NONCE_AUTHORITY_OFFSET,
  SYSTEM_PROGRAM,
  decodeNonce,
  short,
  type NonceFacts,
  type ProtocolConfig,
  type ControlSnapshot,
} from "@overwatch/core";
import {
  db,
  protocols,
  events,
  nonceAccounts,
  signers,
  ingestSnapshot,
  notify,
  enqueueDeliveries,
  latestSnapshot,
  signatureCursors,
  eq,
  and,
} from "@overwatch/db";
import { schedulePublish } from "./publisher";
import { log } from "./log";
import { AccountSweeper, pollAddress, type AccountKind, type CursorStore, type SignatureInfo } from "./poll";

type Row = typeof protocols.$inferSelect;
type Network = "mainnet" | "devnet";
const NETWORKS: Network[] = ["mainnet", "devnet"];
const net = (p: Row): Network => (p.network === "devnet" ? "devnet" : "mainnet");
const rpcs: Record<Network, Rpc> = { mainnet: mainnetRpc(), devnet: devnetRpc() };
const wsUrl = (n: "mainnet" | "devnet") => {
  const key = process.env.HELIUS_API_KEY;
  if (n === "mainnet")
    return (
      process.env.SOLANA_MAINNET_WS_URL ||
      (key ? `wss://mainnet.helius-rpc.com/?api-key=${key}` : "wss://api.mainnet-beta.solana.com")
    );
  return (
    process.env.SOLANA_DEVNET_WS_URL ||
    (key ? `wss://devnet.helius-rpc.com/?api-key=${key}` : "wss://api.devnet.solana.com")
  );
};
const premium = !!process.env.HELIUS_API_KEY;
// Websockets only make changes show up a few seconds sooner; polling catches everything without them.
// Set INDEXER_WEBSOCKETS=false to run on plain HTTP RPC alone.
const useWebsockets = process.env.INDEXER_WEBSOCKETS !== "false";
const ws = useWebsockets
  ? {
      mainnet: new WsSubscriptions(wsUrl("mainnet"), (m) => log("ws:mainnet", m), premium ? 50 : 4).start(),
      devnet: new WsSubscriptions(wsUrl("devnet"), (m) => log("ws:devnet", m), premium ? 50 : 10).start(),
    }
  : null;
// Public mainnet RPC rejects System-program programSubscribe; there we rely on the hourly gPA scan + signer log stream.
const realtimeNonces = (n: "mainnet" | "devnet") =>
  n === "devnet" || premium || process.env.NONCE_PROGRAM_SUBSCRIBE === "true";

const state = new Map<
  string,
  {
    row: Row;
    nonces: NonceFacts[];
    running: Promise<void> | null;
    again: boolean;
    timer?: NodeJS.Timeout;
    tx?: { sig: string | null; blockTime: string | null };
  }
>();
const health = {
  started: new Date().toISOString(),
  lastReconcile: null as string | null,
  lastSweep: null as string | null,
  lastTxSweep: null as string | null,
  processed: 0,
  events: 0,
  errors: 0,
};

async function loadProtocols() {
  return (await db().select().from(protocols)).filter((p) => p.verified);
}

/** Debounced per-protocol refresh: re-read all accounts, diff, score, publish. */
function trigger(
  slug: string,
  why: string,
  opts: { scanNonces?: boolean; tx?: { sig: string | null; blockTime: string | null } } = {},
) {
  const s = state.get(slug);
  if (!s) return;
  if (opts.tx) s.tx = opts.tx;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (s.running) {
      s.again = true;
      return;
    }
    s.running = refresh(slug, why, !!opts.scanNonces).finally(() => {
      s.running = null;
      if (s.again) {
        s.again = false;
        trigger(slug, "coalesced");
      }
    });
  }, 400);
}

async function refresh(slug: string, why: string, scanNonces: boolean) {
  const s = state.get(slug)!;
  const [row] = await db().select().from(protocols).where(eq(protocols.slug, slug));
  if (!row) return;
  s.row = row;
  const cfg = row.config as ProtocolConfig;
  try {
    const { snapshot, nonceScan } = await collectSnapshot(
      rpcs[net(row)],
      { ...cfg, verified: row.verified },
      { scanNonces, nonces: s.nonces, scanProposals: true },
    );
    if (nonceScan === "ok") s.nonces = snapshot.nonces;
    await persistNonces(row, snapshot);
    const tx = s.tx;
    s.tx = undefined;
    const r = await ingestSnapshot(row, snapshot, {
      source: "live",
      txSignature: tx?.sig ?? null,
      blockTime: tx?.blockTime ?? null,
    });
    health.processed++;
    health.events += r.events.length;
    if (r.events.length)
      log(
        "rules",
        `${slug} (${why}): ${r.events.map((e) => `${e.severity} ${e.type}`).join(", ")} → ${r.score.grade} ${r.score.score}`,
      );
    schedulePublish(row, r.score, r.events.some((e) => e.severity === "CRITICAL") || r.score.red);
  } catch (e) {
    health.errors++;
    log("refresh", `${slug}: ${(e as Error).message}`);
  }
}

async function persistNonces(row: Row, snap: ControlSnapshot) {
  const d = db();
  for (const m of snap.multisigs)
    for (const mem of m.members) {
      await d
        .insert(signers)
        .values({ address: mem.key, protocolId: row.id, multisigAddress: m.address })
        .onConflictDoUpdate({ target: [signers.address, signers.multisigAddress], set: { lastSeen: new Date() } });
    }
  for (const n of snap.nonces)
    await d
      .insert(nonceAccounts)
      .values({ address: n.address, authority: n.authority, firstSeenSlot: snap.slot })
      .onConflictDoNothing();
}

/** A watched signer signed a tx whose first instruction is AdvanceNonceAccount → durable-nonce tx. */
async function inspectSignerTx(row: Row, signer: string, signature: string, slot: number) {
  // Throw rather than skip, so the poller keeps its cursor here and retries this transaction next time.
  const tx = await rpcs[net(row)].getTransaction(signature, slot);
  if (!tx) throw new Error(`transaction ${short(signature)} not available yet`);
  const msg = tx.transaction.message;
  const first = msg.instructions[0];
  const isSigner = msg.accountKeys.slice(0, msg.header.numRequiredSignatures).includes(signer);
  const systemIdx = msg.accountKeys.indexOf(SYSTEM_PROGRAM);
  const firstIsAdvance =
    first && first.programIdIndex === systemIdx && Buffer.from(bs58.decode(first.data)).readUInt32LE(0) === 4;
  const touchesNonce = msg.instructions.some(
    (ix) => ix.programIdIndex === systemIdx && [4, 6, 7].includes(Buffer.from(bs58.decode(ix.data)).readUInt32LE(0)),
  );
  if (touchesNonce)
    trigger(row.slug, "nonce instruction", {
      scanNonces: true,
      tx: { sig: signature, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null },
    });
  if (isSigner && firstIsAdvance) {
    const [e] = await db()
      .insert(events)
      .values({
        protocolId: row.id,
        type: "SIGNER_DURABLE_NONCE_TX",
        severity: "HIGH",
        weakening: true,
        title: `A ${row.name} signer just used a pre-signed (durable nonce) transaction`,
        explanation: `Signer ${short(signer)} signed a transaction that starts with AdvanceNonceAccount — it was signed in advance and could have been held for any amount of time. That's how the Drift attacker executed their takeover.`,
        labels: [],
        after: { signer, signature },
        slot: tx.slot,
        blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
        txSignature: signature,
        source: "live",
      })
      .onConflictDoNothing()
      .returning();
    if (e) {
      await notify({
        kind: "event",
        id: e.id,
        slug: row.slug,
        name: row.name,
        type: e.type,
        severity: e.severity,
        weakening: e.weakening,
        slot: e.slot,
        source: e.source,
        title: e.title,
        explanation: e.explanation,
        txSignature: signature,
        labels: [],
        at: e.detectedAt,
      });
      await enqueueDeliveries(row.id, e.id, e.severity);
    }
  }
}

const subscribed = new Set<string>();
async function watch(row: Row) {
  const cfg = row.config as ProtocolConfig;
  const n = net(row);
  const sub = (key: string, fn: () => void) => {
    if (subscribed.has(`${n}:${key}:${row.slug}`)) return;
    subscribed.add(`${n}:${key}:${row.slug}`);
    fn();
  };
  const snap = (await latestSnapshot(row.id))?.data as ControlSnapshot | undefined;
  const accounts = new Set<string>([
    ...(snap?.programs.flatMap((p) => [p.programId, p.programDataAddress]) ?? cfg.programs.map((p) => p.id)),
    ...cfg.multisigs.map((m) => m.address),
    ...cfg.collateral_mints,
    ...cfg.oracles,
    ...cfg.admin_accounts,
    ...(adapters.get(row.slug)?.accounts() ?? []),
  ]);
  for (const a of accounts)
    sub(a, () => {
      watchAccount(n, a, accountKind(a, cfg, snap), row.slug);
      ws?.[n].accountSubscribe(a, () => trigger(row.slug, `account ${short(a)} changed`));
    });
  // nonce accounts whose authority is a watched signer (real-time) + tx stream mentioning signers/multisigs
  const signerKeys = [...new Set(snap?.multisigs.flatMap((m) => m.members.map((x) => x.key)) ?? [])];
  for (const sk of signerKeys) {
    if (ws && realtimeNonces(n))
      sub(`nonce:${sk}`, () =>
        ws[n].programSubscribe(
          SYSTEM_PROGRAM,
          [{ dataSize: NONCE_ACCOUNT_LEN }, { memcmp: { offset: NONCE_AUTHORITY_OFFSET, bytes: sk } }],
          (v) => {
            const val = v as { pubkey: string; account: { data: [string, string] } };
            const nonce = decodeNonce(val.pubkey, Uint8Array.from(Buffer.from(val.account.data[0], "base64")));
            log(
              "nonce",
              `${row.slug}: nonce account ${short(val.pubkey)} ${nonce ? `authority ${short(nonce.authority)}` : "closed/uninitialized"}`,
            );
            trigger(row.slug, "signer nonce account", { scanNonces: true });
          },
        ),
      );
    sub(`logs:${sk}`, () => {
      pollTransactions(n, sk, (sig) => inspectSignerTx(row, sk, sig.signature, sig.slot));
      ws?.[n].logsSubscribe(sk, (v, slot) => {
        const sig = (v as { signature: string; err: unknown }).signature;
        // A failure here is fine: the poller sees the same transaction and retries until it succeeds.
        inspectSignerTx(row, sk, sig, slot).catch(() => {});
      });
    });
  }
  for (const m of cfg.multisigs)
    sub(`logs:${m.address}`, () => {
      pollTransactions(n, m.address, async (sig) =>
        trigger(row.slug, "multisig tx", { tx: { sig: sig.signature, blockTime: blockTimeIso(sig) } }),
      );
      ws?.[n].logsSubscribe(m.address, (v) => {
        const sig = (v as { signature: string }).signature;
        trigger(row.slug, "multisig tx", { tx: { sig, blockTime: new Date().toISOString() } });
      });
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Polling registry: what the sweep reads every POLL_INTERVAL_MS.
// ---------------------------------------------------------------------------------------------------------------

/** Every watched account per network, with how to fingerprint it and which protocols care about it. */
const watchedAccounts: Record<Network, Map<string, { kind: AccountKind; slugs: Set<string> }>> = {
  mainnet: new Map(),
  devnet: new Map(),
};
/** Every address whose transactions we follow per network, with what to do for each new transaction. */
const polledAddresses: Record<Network, Map<string, ((sig: SignatureInfo) => Promise<void>)[]>> = {
  mainnet: new Map(),
  devnet: new Map(),
};
const sweepers: Record<Network, AccountSweeper> = { mainnet: new AccountSweeper(), devnet: new AccountSweeper() };

/** Decides which bytes of an account count as a change (see `fingerprint` in poll.ts). */
function accountKind(address: string, cfg: ProtocolConfig, snap: ControlSnapshot | undefined): AccountKind {
  const programData = snap?.programs.map((p) => p.programDataAddress) ?? [];
  if (programData.includes(address)) return "programdata";
  if (cfg.collateral_mints.includes(address)) return "mint";
  if (cfg.oracles.includes(address)) return "oracle";
  return "other";
}

function watchAccount(n: Network, address: string, kind: AccountKind, slug: string) {
  const existing = watchedAccounts[n].get(address);
  if (existing) existing.slugs.add(slug);
  else watchedAccounts[n].set(address, { kind, slugs: new Set([slug]) });
}

function pollTransactions(n: Network, address: string, handler: (sig: SignatureInfo) => Promise<void>) {
  const handlers = polledAddresses[n].get(address) ?? [];
  handlers.push(handler);
  polledAddresses[n].set(address, handlers);
}

const blockTimeIso = (sig: SignatureInfo) => (sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null);

/** Cursors live in Postgres, so a restart (or a second indexer elsewhere) resumes where the last one stopped. */
const cursorStore: CursorStore = {
  async get(network, address) {
    const [row] = await db()
      .select()
      .from(signatureCursors)
      .where(and(eq(signatureCursors.network, network), eq(signatureCursors.address, address)));
    return row ? { signature: row.signature, slot: row.slot } : null;
  },
  async set(network, address, { signature, slot }) {
    await db()
      .insert(signatureCursors)
      .values({ network, address, signature, slot })
      .onConflictDoUpdate({
        target: [signatureCursors.network, signatureCursors.address],
        set: { signature, slot, updatedAt: new Date() },
      });
  },
};

/** Refreshes every protocol that watches an account that just changed. */
function triggerWatchers(n: Network, address: string) {
  const slugs = watchedAccounts[n].get(address)?.slugs ?? new Set<string>();
  for (const slug of slugs) trigger(slug, `account ${short(address)} changed (poll)`);
}

/** Runs every handler registered for an address; any failure propagates so the cursor is not advanced. */
async function runHandlers(handlers: ((sig: SignatureInfo) => Promise<void>)[], sig: SignatureInfo) {
  for (const handler of handlers) await handler(sig);
}

/** Accounts: one batched read of everything, then refresh the protocols whose accounts changed. */
async function sweepAccounts(n: Network) {
  if (!watchedAccounts[n].size) return;
  const kinds = new Map<string, AccountKind>();
  for (const [address, w] of watchedAccounts[n]) kinds.set(address, w.kind);
  const changed = await sweepers[n].sweep(rpcs[n], kinds);
  for (const address of changed) triggerWatchers(n, address);
}

/** Transactions: everything new since each address's cursor, including anything missed while we were down. */
async function sweepTransactions(n: Network) {
  for (const [address, handlers] of polledAddresses[n]) {
    try {
      const r = await pollAddress(rpcs[n], cursorStore, n, address, (sig) => runHandlers(handlers, sig));
      if (r.processed) log("poll", `${n} ${short(address)}: ${r.processed} new transaction(s)`);
      if (r.truncated) log("poll", `${n} ${short(address)}: backlog too long, replayed only the newest pages`);
    } catch (e) {
      health.errors++;
      log("poll", `${n} ${short(address)}: ${(e as Error).message}`);
    }
  }
}

// Accounts are one cheap batched call, so they are read often. Transactions take one call per address, and free
// endpoints limit each method to roughly 4 calls a second, so they are read less often. Raise these on a paid RPC.
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15_000);
const TX_POLL_INTERVAL_MS = Number(process.env.TX_POLL_INTERVAL_MS ?? 60_000);

/**
 * Runs `work` for every network unless the previous run is still going (a slow RPC must not stack runs on top of
 * each other). Returns the function to put on a timer.
 */
function everyNetwork(name: string, work: (n: Network) => Promise<void>, done: () => void) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    const started = Date.now();
    try {
      for (const n of NETWORKS) await work(n);
      done();
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (Date.now() - started > 10_000) log(name, `took ${seconds}s`);
    } catch (e) {
      health.errors++;
      log(name, (e as Error).message);
    } finally {
      running = false;
    }
  };
}

const accountSweep = everyNetwork("accounts", sweepAccounts, () => {
  health.lastSweep = new Date().toISOString();
});
const transactionSweep = everyNetwork("transactions", sweepTransactions, () => {
  health.lastTxSweep = new Date().toISOString();
});

async function reconcile(scanNonces: boolean) {
  const rows = await loadProtocols();
  for (const row of rows) {
    if (!state.has(row.slug)) state.set(row.slug, { row, nonces: [], running: null, again: false });
    await watch(row).catch((e) => log("watch", `${row.slug}: ${(e as Error).message}`));
    await refresh(row.slug, scanNonces ? "hourly reconcile+nonce scan" : "5-min reconcile", scanNonces);
  }
  health.lastReconcile = new Date().toISOString();
  const accounts = watchedAccounts.mainnet.size + watchedAccounts.devnet.size;
  const addresses = polledAddresses.mainnet.size + polledAddresses.devnet.size;
  log(
    "reconcile",
    `${rows.length} protocols, polling ${accounts} accounts + ${addresses} addresses${scanNonces ? " (nonce scan)" : ""}`,
  );
}

// A stuck process can still answer /health, so exit and let the supervisor (Docker, systemd, Fly…) restart it.
const STUCK_MS = 20 * 60_000;
function watchdog() {
  const last = Date.parse(health.lastReconcile ?? health.started);
  if (Date.now() - last < STUCK_MS) return;
  log("indexer", `no successful reconcile since ${health.lastReconcile ?? health.started}, exiting for a restart`);
  process.exit(1);
}

async function main() {
  log("indexer", "starting");
  setInterval(watchdog, 60_000);
  await reconcile(true);
  setInterval(() => void accountSweep(), POLL_INTERVAL_MS);
  // Run the first transaction sweep right away: it replays whatever happened while the indexer was down.
  void transactionSweep();
  setInterval(() => void transactionSweep(), TX_POLL_INTERVAL_MS);
  setInterval(() => void reconcile(false), 5 * 60_000);
  setInterval(() => void reconcile(true), 60 * 60_000);
  // pick up newly registered protocols quickly
  setInterval(async () => {
    for (const row of await loadProtocols())
      if (!state.has(row.slug)) {
        state.set(row.slug, { row, nonces: [], running: null, again: false });
        await watch(row);
        trigger(row.slug, "new protocol", { scanNonces: true });
      }
  }, 15_000);
  const port = Number(process.env.INDEXER_PORT ?? 8787);
  createServer((req, res) => {
    const body = JSON.stringify({
      ...health,
      ws: ws && {
        mainnet: { healthy: ws.mainnet.healthy, subs: ws.mainnet.size },
        devnet: { healthy: ws.devnet.healthy, subs: ws.devnet.size },
      },
    });
    // Healthy means polling is keeping up: a sweep finished within the last few intervals.
    // Before the first sweep, give startup (the initial reconcile can take minutes) the benefit of the doubt.
    const lastSweep = health.lastSweep ? Date.parse(health.lastSweep) : null;
    const keepingUp = lastSweep === null || Date.now() - lastSweep < 4 * POLL_INTERVAL_MS + 60_000;
    res.writeHead(req.url === "/health" && keepingUp ? 200 : 503, { "content-type": "application/json" }).end(body);
  }).listen(port, () => log("indexer", `health on :${port}/health`));
}

process.on("unhandledRejection", (e) => log("indexer", `unhandled: ${(e as Error)?.message ?? e}`));
void main();
