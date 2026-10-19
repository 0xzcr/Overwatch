// DEVNET ONLY: the connection, key and sender the registry publisher uses. Refuses mainnet URLs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { repoRoot } from "@overwatch/db/env";

export function connection() {
  const key = process.env.HELIUS_API_KEY;
  const url =
    process.env.SOLANA_DEVNET_RPC_URL ||
    (key ? `https://devnet.helius-rpc.com/?api-key=${key}` : "https://api.devnet.solana.com");
  if (/mainnet/i.test(url)) throw new Error("refusing to send transactions to a mainnet RPC");
  return new Connection(url, { commitment: "confirmed", wsEndpoint: process.env.SOLANA_DEVNET_WS_URL || undefined });
}

export function publisherKey(): Keypair {
  const f = process.env.PUBLISHER_KEYPAIR_PATH || "keys/publisher-keypair.json";
  const path = f.startsWith("/") ? f : resolve(repoRoot(), f.replace(/^~\//, `${process.env.HOME}/`));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

/** Sends with a priority fee, retrying transient failures (expired blockhash, timeouts, rate limits). */
export async function send(conn: Connection, ixs: TransactionInstruction[], signers: Keypair[], label = "tx") {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), ...ixs);
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
    } catch (e) {
      last = e;
      if (!/blockhash|timeout|429|fetch failed/i.test((e as Error).message)) break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  const logs = (last as { logs?: string[] }).logs?.slice(-6).join("\n") ?? "";
  throw new Error(`${label} failed: ${(last as Error).message}\n${logs}`);
}
