// DEVNET ONLY. Every connection in this package is created here and refuses mainnet URLs.
import { repoRoot } from "@overwatch/db/env";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const ROOT = repoRoot();
const p = (f: string) => (f.startsWith("/") ? f : resolve(ROOT, f.replace(/^~\//, `${process.env.HOME}/`)));

export function connection() {
  const key = process.env.HELIUS_API_KEY;
  const url = process.env.SOLANA_DEVNET_RPC_URL || (key ? `https://devnet.helius-rpc.com/?api-key=${key}` : "https://api.devnet.solana.com");
  if (/mainnet/i.test(url)) throw new Error("refusing to send transactions to a mainnet RPC");
  return new Connection(url, { commitment: "confirmed", wsEndpoint: process.env.SOLANA_DEVNET_WS_URL || undefined });
}

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p(path), "utf8"))));
}

export const keys = () => ({
  admin: loadKeypair(process.env.DEMO_ADMIN_KEYPAIR_PATH || "keys/demo-admin-keypair.json"),
  publisher: loadKeypair(process.env.PUBLISHER_KEYPAIR_PATH || "keys/publisher-keypair.json"),
  signerA: loadKeypair("keys/signer-a-keypair.json"),
  signerB: loadKeypair("keys/signer-b-keypair.json"),
  signerC: loadKeypair("keys/signer-c-keypair.json"),
  attacker: loadKeypair("keys/attacker-keypair.json"),
  funder: process.env.FUNDER_KEYPAIR_PATH ? loadKeypair(process.env.FUNDER_KEYPAIR_PATH) : null,
});

export interface DemoState {
  multisig: string;
  vaultPda: string;
  createKey: string;
  registryMultisig: string;
  registryAdminVault: string;
  demoProgram: string;
  mint: string;
  userTokens: string;
  userShares: string;
  slug: string;
}
const STATE = () => p("keys/demo-state.json");
export const hasState = () => existsSync(STATE());
export const loadState = (): DemoState => JSON.parse(readFileSync(STATE(), "utf8"));
export const saveState = (s: DemoState) => writeFileSync(STATE(), JSON.stringify(s, null, 2));
export const DEMO_SLUG = "overwatch-demo";
export const pk = (s: string) => new PublicKey(s);
