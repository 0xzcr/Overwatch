/**
 * Overwatch indexer: account watchers + tx stream + reconciler → snapshots → rules → score → publish.
 * Mainnet is read-only. Devnet is used for the demo protocol and the onchain registry/vault.
 */
import "@overwatch/db/env";
import { createServer } from "node:http";
import { mainnetRpc, devnetRpc, WsSubscriptions, type Rpc } from "@overwatch/solana";
import {
  collectSnapshot, NONCE_ACCOUNT_LEN, NONCE_AUTHORITY_OFFSET, SYSTEM_PROGRAM, decodeNonce, short, type NonceFacts, type ProtocolConfig, type ControlSnapshot,
} from "@overwatch/core";
import { db, protocols, events, nonceAccounts, signers, ingestSnapshot, notify, enqueueDeliveries, latestSnapshot, eq } from "@overwatch/db";
import { schedulePublish } from "./publisher";
import { log } from "./log";

type Row = typeof protocols.$inferSelect;
const net = (p: Row) => (p.network === "devnet" ? "devnet" : "mainnet");
const rpcs: Record<"mainnet" | "devnet", Rpc> = { mainnet: mainnetRpc(), devnet: devnetRpc() };
const wsUrl = (n: "mainnet" | "devnet") => {
  const key = process.env.HELIUS_API_KEY;
  if (n === "mainnet") return process.env.SOLANA_MAINNET_WS_URL || (key ? `wss://mainnet.helius-rpc.com/?api-key=${key}` : "wss://api.mainnet-beta.solana.com");
  return process.env.SOLANA_DEVNET_WS_URL || (key ? `wss://devnet.helius-rpc.com/?api-key=${key}` : "wss://api.devnet.solana.com");
};
const premium = !!process.env.HELIUS_API_KEY;
const ws = {
  mainnet: new WsSubscriptions(wsUrl("mainnet"), (m) => log("ws:mainnet", m), premium ? 50 : 4).start(),
  devnet: new WsSubscriptions(wsUrl("devnet"), (m) => log("ws:devnet", m), premium ? 50 : 10).start(),
};
// Public mainnet RPC rejects System-program programSubscribe; there we rely on the hourly gPA scan + signer log stream.
const realtimeNonces = (n: "mainnet" | "devnet") => n === "devnet" || premium || process.env.NONCE_PROGRAM_SUBSCRIBE === "true";

const state = new Map<string, { row: Row; nonces: NonceFacts[]; running: Promise<void> | null; again: boolean; timer?: NodeJS.Timeout; tx?: { sig: string | null; blockTime: string | null } }>();
const health = { started: new Date().toISOString(), lastReconcile: null as string | null, processed: 0, events: 0, errors: 0 };

async function loadProtocols() {
  return (await db().select().from(protocols)).filter((p) => p.verified || p.source === "demo");
}

/** Debounced per-protocol refresh: re-read all accounts, diff, score, publish. */
function trigger(slug: string, why: string, opts: { scanNonces?: boolean; tx?: { sig: string | null; blockTime: string | null } } = {}) {
  const s = state.get(slug);
  if (!s) return;
  if (opts.tx) s.tx = opts.tx;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (s.running) { s.again = true; return; }
    s.running = refresh(slug, why, !!opts.scanNonces).finally(() => {
      s.running = null;
      if (s.again) { s.again = false; trigger(slug, "coalesced"); }
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
    const { snapshot, nonceScan } = await collectSnapshot(rpcs[net(row)], { ...cfg, verified: row.verified }, { scanNonces, nonces: s.nonces, scanProposals: true });
    if (nonceScan === "ok") s.nonces = snapshot.nonces;
    await persistNonces(row, snapshot);
    const tx = s.tx;
    s.tx = undefined;
    const r = await ingestSnapshot(row, snapshot, { source: row.source === "demo" ? "demo" : "live", txSignature: tx?.sig ?? null, blockTime: tx?.blockTime ?? null });
    health.processed++;
    health.events += r.events.length;
    if (r.events.length) log("rules", `${slug} (${why}): ${r.events.map((e) => `${e.severity} ${e.type}`).join(", ")} → ${r.score.grade} ${r.score.score}`);
    schedulePublish(row, r.score, r.events.some((e) => e.severity === "CRITICAL") || r.score.red);
  } catch (e) {
    health.errors++;
    log("refresh", `${slug}: ${(e as Error).message}`);
  }
}

async function persistNonces(row: Row, snap: ControlSnapshot) {
  const d = db();
  for (const m of snap.multisigs) for (const mem of m.members) {
    await d.insert(signers).values({ address: mem.key, protocolId: row.id, multisigAddress: m.address }).onConflictDoUpdate({ target: [signers.address, signers.multisigAddress], set: { lastSeen: new Date() } });
  }
  for (const n of snap.nonces) await d.insert(nonceAccounts).values({ address: n.address, authority: n.authority, firstSeenSlot: snap.slot }).onConflictDoNothing();
}

/** A watched signer signed a tx whose first instruction is AdvanceNonceAccount → durable-nonce tx. */
async function inspectSignerTx(row: Row, signer: string, signature: string) {
  const tx = await rpcs[net(row)].getTransaction(signature).catch(() => null);
  if (!tx) return;
  const msg = tx.transaction.message;
  const first = msg.instructions[0];
  const isSigner = msg.accountKeys.slice(0, msg.header.numRequiredSignatures).includes(signer);
  const systemIdx = msg.accountKeys.indexOf(SYSTEM_PROGRAM);
  const firstIsAdvance = first && first.programIdIndex === systemIdx && Buffer.from(bs58decode(first.data)).readUInt32LE(0) === 4;
  const touchesNonce = msg.instructions.some((ix) => ix.programIdIndex === systemIdx && [4, 6, 7].includes(Buffer.from(bs58decode(ix.data)).readUInt32LE(0)));
  if (touchesNonce) trigger(row.slug, "nonce instruction", { scanNonces: true, tx: { sig: signature, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null } });
  if (isSigner && firstIsAdvance) {
    const [e] = await db().insert(events).values({
      protocolId: row.id, type: "SIGNER_DURABLE_NONCE_TX", severity: "HIGH", weakening: true,
      title: `A ${row.name} signer just used a pre-signed (durable nonce) transaction`,
      explanation: `Signer ${short(signer)} signed a transaction that starts with AdvanceNonceAccount — it was signed in advance and could have been held for any amount of time. That's how the Drift attacker executed their takeover.`,
      labels: [], after: { signer, signature }, slot: tx.slot, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null, txSignature: signature, source: row.source === "demo" ? "demo" : "live",
    }).onConflictDoNothing().returning();
    if (e) {
      await notify({ kind: "event", id: e.id, slug: row.slug, name: row.name, type: e.type, severity: e.severity, title: e.title, explanation: e.explanation, txSignature: signature, labels: [], at: e.detectedAt });
      await enqueueDeliveries(row.id, e.id, e.severity);
    }
  }
}

import bs58 from "bs58";
const bs58decode = (s: string) => bs58.decode(s);

const subscribed = new Set<string>();
async function watch(row: Row) {
  const cfg = row.config as ProtocolConfig;
  const n = net(row);
  const sub = (key: string, fn: () => void) => { if (subscribed.has(`${n}:${key}:${row.slug}`)) return; subscribed.add(`${n}:${key}:${row.slug}`); fn(); };
  const snap = (await latestSnapshot(row.id))?.data as ControlSnapshot | undefined;
  const accounts = new Set<string>([
    ...(snap?.programs.flatMap((p) => [p.programId, p.programDataAddress]) ?? cfg.programs.map((p) => p.id)),
    ...cfg.multisigs.map((m) => m.address), ...cfg.collateral_mints, ...cfg.oracles, ...cfg.admin_accounts,
  ]);
  for (const a of accounts) sub(a, () => ws[n].accountSubscribe(a, () => trigger(row.slug, `account ${short(a)} changed`)));
  // nonce accounts whose authority is a watched signer (real-time) + tx stream mentioning signers/multisigs
  const signerKeys = [...new Set(snap?.multisigs.flatMap((m) => m.members.map((x) => x.key)) ?? [])];
  for (const sk of signerKeys) {
    if (realtimeNonces(n)) sub(`nonce:${sk}`, () => ws[n].programSubscribe(SYSTEM_PROGRAM, [{ dataSize: NONCE_ACCOUNT_LEN }, { memcmp: { offset: NONCE_AUTHORITY_OFFSET, bytes: sk } }], (v) => {
      const val = v as { pubkey: string; account: { data: [string, string] } };
      const nonce = decodeNonce(val.pubkey, Uint8Array.from(Buffer.from(val.account.data[0], "base64")));
      log("nonce", `${row.slug}: nonce account ${short(val.pubkey)} ${nonce ? `authority ${short(nonce.authority)}` : "closed/uninitialized"}`);
      trigger(row.slug, "signer nonce account", { scanNonces: true });
    }));
    sub(`logs:${sk}`, () => ws[n].logsSubscribe(sk, (v) => {
      const sig = (v as { signature: string; err: unknown }).signature;
      void inspectSignerTx(row, sk, sig);
    }));
  }
  for (const m of cfg.multisigs) sub(`logs:${m.address}`, () => ws[n].logsSubscribe(m.address, (v) => {
    const sig = (v as { signature: string }).signature;
    trigger(row.slug, "multisig tx", { tx: { sig, blockTime: new Date().toISOString() } });
  }));
}

async function reconcile(scanNonces: boolean) {
  const rows = await loadProtocols();
  for (const row of rows) {
    if (!state.has(row.slug)) state.set(row.slug, { row, nonces: [], running: null, again: false });
    await watch(row).catch((e) => log("watch", `${row.slug}: ${(e as Error).message}`));
    await refresh(row.slug, scanNonces ? "hourly reconcile+nonce scan" : "5-min reconcile", scanNonces);
  }
  health.lastReconcile = new Date().toISOString();
  log("reconcile", `${rows.length} protocols, ${ws.mainnet.size + ws.devnet.size} subscriptions${scanNonces ? " (nonce scan)" : ""}`);
}

async function main() {
  log("indexer", "starting");
  await reconcile(true);
  setInterval(() => void reconcile(false), 5 * 60_000);
  setInterval(() => void reconcile(true), 60 * 60_000);
  // pick up newly registered protocols (e.g. demo setup) quickly
  setInterval(async () => {
    for (const row of await loadProtocols()) if (!state.has(row.slug)) { state.set(row.slug, { row, nonces: [], running: null, again: false }); await watch(row); trigger(row.slug, "new protocol", { scanNonces: true }); }
  }, 15_000);
  const port = Number(process.env.INDEXER_PORT ?? 8787);
  createServer((req, res) => {
    const body = JSON.stringify({ ...health, ws: { mainnet: { healthy: ws.mainnet.healthy, subs: ws.mainnet.size }, devnet: { healthy: ws.devnet.healthy, subs: ws.devnet.size } } });
    res.writeHead(req.url === "/health" && (ws.mainnet.healthy || ws.devnet.healthy) ? 200 : 503, { "content-type": "application/json" }).end(body);
  }).listen(port, () => log("indexer", `health on :${port}/health`));
}

process.on("unhandledRejection", (e) => log("indexer", `unhandled: ${(e as Error)?.message ?? e}`));
void main();
