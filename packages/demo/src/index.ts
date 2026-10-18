/**
 * Overwatch DEVNET demo. Real devnet transactions against a real Squads v4 multisig.
 * The demo multisig is *controlled* (configAuthority = demo admin) so config changes execute instantly —
 * Overwatch flags that as CONTROLLED_MULTISIG from the start, which is intended.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as multisig from "@sqds/multisig";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, NONCE_ACCOUNT_LENGTH } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { RegistryIx, VaultIx } from "@overwatch/sdk/tx";
import { collectSnapshot, type ProtocolConfig } from "@overwatch/core";
import { db, protocols, ingestSnapshot, eq, sql as rawSql } from "@overwatch/db";
import { connection, keys, saveState, loadState, hasState, DEMO_SLUG, pk, ROOT, type DemoState } from "./env";
import { send, type Log } from "./tx";

export { hasState, loadState, DEMO_SLUG };
export type { Log, DemoState };

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const { Permissions } = multisig.types;
const ALL = Permissions.all();
const TWO_DAYS = 172_800;

function setAuthorityIx(programData: PublicKey, current: PublicKey, next: PublicKey) {
  // UpgradeableLoaderInstruction::SetAuthority = 4
  return new TransactionInstruction({ programId: BPF_LOADER, keys: [{ pubkey: programData, isSigner: false, isWritable: true }, { pubkey: current, isSigner: true, isWritable: false }, { pubkey: next, isSigner: false, isWritable: false }], data: Buffer.from([4, 0, 0, 0]) });
}
const programDataOf = (program: PublicKey) => PublicKey.findProgramAddressSync([program.toBuffer()], BPF_LOADER)[0];

async function fund(log: Log, targets: PublicKey[], sol: number) {
  const conn = connection();
  const k = keys();
  for (const t of targets) {
    const bal = await conn.getBalance(t);
    if (bal >= sol * LAMPORTS_PER_SOL * 0.5) continue;
    if (k.funder) {
      await send(conn, [SystemProgram.transfer({ fromPubkey: k.funder.publicKey, toPubkey: t, lamports: Math.round(sol * LAMPORTS_PER_SOL) })], [k.funder], log, `fund ${t.toBase58().slice(0, 6)}… with ${sol} SOL`);
    } else {
      try {
        const sig = await conn.requestAirdrop(t, sol * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, "confirmed");
        log(`✔ airdrop ${sol} SOL → ${t.toBase58()}`, sig);
      } catch {
        throw new Error(`Airdrop failed (rate limit). Fund ${t.toBase58()} at https://faucet.solana.com or set FUNDER_KEYPAIR_PATH to a funded devnet keypair.`);
      }
    }
  }
}

async function createMultisig(log: Log, label: string, members: PublicKey[], threshold: number, timeLock: number, configAuthority: PublicKey | null) {
  const conn = connection();
  const { admin } = keys();
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, programConfigPda);
  const ix = multisig.instructions.multisigCreateV2({
    treasury: programConfig.treasury, creator: admin.publicKey, multisigPda, configAuthority, threshold,
    members: members.map((key) => ({ key, permissions: ALL })), timeLock, createKey: createKey.publicKey, rentCollector: null,
  });
  await send(conn, [ix], [admin, createKey], log, `create ${label} (${threshold}-of-${members.length}, timelock ${timeLock}s, configAuthority ${configAuthority ? "demo admin" : "none"})`);
  return { multisigPda, createKey: createKey.publicKey, vault: multisig.getVaultPda({ multisigPda, index: 0 })[0] };
}

function deployDemoProgram(log: Log, upgradeAuthority: PublicKey): PublicKey {
  const k = keys();
  const payerPath = process.env.FUNDER_KEYPAIR_PATH ? process.env.FUNDER_KEYPAIR_PATH.replace(/^~\//, `${process.env.HOME}/`) : join(ROOT, process.env.DEMO_ADMIN_KEYPAIR_PATH || "keys/demo-admin-keypair.json");
  const progKp = Keypair.generate();
  const dir = mkdtempSync(join(tmpdir(), "ow-"));
  const progPath = join(dir, "program.json");
  writeFileSync(progPath, JSON.stringify([...progKp.secretKey]));
  const adminPath = join(ROOT, process.env.DEMO_ADMIN_KEYPAIR_PATH || "keys/demo-admin-keypair.json");
  const url = connection().rpcEndpoint;
  execFileSync("solana", ["program", "deploy", join(ROOT, "target/deploy/overwatch_demo_protocol.so"), "--program-id", progPath, "--keypair", payerPath, "--upgrade-authority", adminPath, "-u", url, "--with-compute-unit-price", "5000"], { stdio: "pipe" });
  log(`✔ deployed demo protocol program ${progKp.publicKey.toBase58()}`);
  execFileSync("solana", ["program", "set-upgrade-authority", progKp.publicKey.toBase58(), "--upgrade-authority", adminPath, "--new-upgrade-authority", upgradeAuthority.toBase58(), "--skip-new-upgrade-authority-signer-check", "--keypair", payerPath, "-u", url], { stdio: "pipe" });
  log(`✔ set upgrade authority → Squads vault ${upgradeAuthority.toBase58()}`);
  void k;
  return progKp.publicKey;
}

export function demoConfig(s: DemoState): ProtocolConfig {
  return {
    slug: DEMO_SLUG, name: "Overwatch Demo Protocol", category: "demo", defillama_slug: null, website: "https://explorer.solana.com/?cluster=devnet",
    docs_sources: ["scripts/demo.ts"], programs: [{ id: s.demoProgram, label: "Demo program" }],
    multisigs: [{ address: s.multisig, vault_index: 0, role: "upgrade_authority" }], admin_accounts: [], collateral_mints: [], oracles: [],
    verified: true, source: "demo", network: "devnet", notes: "DEMO on devnet. Controlled multisig by design.",
  };
}

export async function registerDemoProtocol(s: DemoState, log: Log) {
  const cfg = demoConfig(s);
  const d = db();
  const { snapshot } = await collectSnapshot(connectionReader(), cfg, { scanNonces: true });
  const values = { slug: cfg.slug, name: cfg.name, category: cfg.category, website: cfg.website, network: "devnet", source: "demo", config: { ...cfg, demoResetAt: new Date().toISOString() }, verified: true, verification: { checkedAt: new Date().toISOString(), problems: [] } };
  const [row] = await d.insert(protocols).values(values).onConflictDoUpdate({ target: protocols.slug, set: values }).returning();
  await rawSql()`delete from snapshots where protocol_id = ${row!.id}`;
  await ingestSnapshot(row!, snapshot, { source: "demo", force: true });
  log(`✔ registered ${DEMO_SLUG} in the Overwatch DB (source: demo)`);
}

/** Adapter: web3.js Connection → core AccountReader (devnet). */
export function connectionReader() {
  const conn = connection();
  const toAcc = (address: string, a: { owner: PublicKey; lamports: number; data: Buffer } | null) => (a ? { address, owner: a.owner.toBase58(), lamports: a.lamports, data: new Uint8Array(a.data) } : null);
  return {
    getSlot: () => conn.getSlot("confirmed"),
    async getMultipleAccounts(addrs: string[], slice?: { offset: number; length: number }) {
      const out = [];
      for (let i = 0; i < addrs.length; i += 100) {
        const chunk = addrs.slice(i, i + 100);
        const res = await conn.getMultipleAccountsInfo(chunk.map(pk), { commitment: "confirmed", dataSlice: slice });
        out.push(...res.map((a, j) => toAcc(chunk[j]!, a)));
      }
      return out;
    },
    async getProgramAccounts(program: string, filters: unknown[]) {
      const res = await conn.getProgramAccounts(pk(program), { commitment: "confirmed", filters: filters as never });
      return res.map((r) => toAcc(r.pubkey.toBase58(), r.account)!);
    },
  };
}

export async function setup(log: Log = console.log): Promise<DemoState> {
  const conn = connection();
  const k = keys();
  await fund(log, [k.admin.publicKey], 1.2);
  await fund(log, [k.publisher.publicKey, k.signerA.publicKey], 0.1);

  // Registry: init (admin = demo admin), add publisher, then hand admin to a Squads multisig.
  const reg = new RegistryIx(process.env.REGISTRY_PROGRAM_ID || undefined);
  const cfgAcc = await conn.getAccountInfo(reg.config());
  let registryMs = { multisigPda: PublicKey.default, vault: PublicKey.default };
  if (!cfgAcc) {
    await send(conn, [reg.initialize(k.admin.publicKey, k.admin.publicKey), reg.addPublisher(k.admin.publicKey, k.publisher.publicKey)], [k.admin], log, "initialize registry + add publisher");
    const ms = await createMultisig(log, "registry admin multisig", [k.admin.publicKey, k.signerB.publicKey, k.signerC.publicKey], 2, 0, null);
    await send(conn, [reg.setAdmin(k.admin.publicKey, ms.vault)], [k.admin], log, "hand registry admin to Squads multisig vault");
    registryMs = { multisigPda: ms.multisigPda, vault: ms.vault };
  } else if (hasState()) {
    const s = loadState();
    registryMs = { multisigPda: pk(s.registryMultisig), vault: pk(s.registryAdminVault) };
  }

  // Demo multisig: 3 members, threshold 2, 2-day timelock, controlled by demo admin.
  const ms = await createMultisig(log, "demo protocol multisig", [k.admin.publicKey, k.signerA.publicKey, k.signerB.publicKey], 2, TWO_DAYS, k.admin.publicKey);
  const demoProgram = deployDemoProgram(log, ms.vault);

  // Vault: mint, init, deposit, allocate.
  const mint = await createMint(conn, k.admin, k.admin.publicKey, null, 6);
  log(`✔ created demo USDC-like mint ${mint.toBase58()} (DEMO token, no value)`);
  const vix = new VaultIx(mint, process.env.VAULT_PROGRAM_ID || undefined, process.env.REGISTRY_PROGRAM_ID || undefined);
  await send(conn, [vix.initializeVault(k.admin.publicKey, 40)], [k.admin], log, "initialize protected vault (min score 40)");
  const userTokens = await getOrCreateAssociatedTokenAccount(conn, k.admin, mint, k.admin.publicKey);
  const userShares = await getOrCreateAssociatedTokenAccount(conn, k.admin, vix.shareMint(), k.admin.publicKey);
  await mintTo(conn, k.admin, mint, userTokens.address, k.admin, 100_000_000_000n);
  await send(conn, [vix.deposit(k.admin.publicKey, userTokens.address, userShares.address, 50_000_000_000n)], [k.admin], log, "deposit 50,000 demo USDC");
  // the publisher must have written a RiskRecord before the position exists? no — allocate only needs the vault
  await send(conn, [vix.allocate(k.admin.publicKey, DEMO_SLUG, 40_000_000_000n)], [k.admin], log, "allocate 40,000 to demo strategy (simulated allocation)");

  const state: DemoState = {
    multisig: ms.multisigPda.toBase58(), vaultPda: ms.vault.toBase58(), createKey: ms.createKey.toBase58(),
    registryMultisig: registryMs.multisigPda.toBase58(), registryAdminVault: registryMs.vault.toBase58(),
    demoProgram: demoProgram.toBase58(), mint: mint.toBase58(), userTokens: userTokens.address.toBase58(), userShares: userShares.address.toBase58(), slug: DEMO_SLUG,
  };
  saveState(state);
  await registerDemoProtocol(state, log);
  return state;
}

// ---------- actions ----------
const ctx = () => ({ conn: connection(), k: keys(), s: loadState() });

export async function removeTimelock(log: Log = console.log) {
  const { conn, k, s } = ctx();
  return send(conn, [multisig.instructions.multisigSetTimeLock({ multisigPda: pk(s.multisig), configAuthority: k.admin.publicKey, timeLock: 0 })], [k.admin], log, "Remove timelock (2 days → 0)");
}

export async function lowerThreshold(log: Log = console.log, to = 1) {
  const { conn, k, s } = ctx();
  return send(conn, [multisig.instructions.multisigChangeThreshold({ multisigPda: pk(s.multisig), configAuthority: k.admin.publicKey, rentPayer: k.admin.publicKey, newThreshold: to })], [k.admin], log, `Lower threshold to ${to}`);
}

export async function createSignerNonce(log: Log = console.log) {
  const { conn, k } = ctx();
  const nonce = Keypair.generate();
  const lamports = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  const tx = SystemProgram.createNonceAccount({ fromPubkey: k.admin.publicKey, noncePubkey: nonce.publicKey, authorizedPubkey: k.signerA.publicKey, lamports });
  return send(conn, tx.instructions, [k.admin, nonce], log, `Create durable nonce ${nonce.publicKey.toBase58().slice(0, 6)}… for signer ${k.signerA.publicKey.toBase58().slice(0, 6)}…`);
}

/** Moves the demo program's upgrade authority from the multisig vault to a single key (attacker) via a real vault transaction. */
export async function transferAuthority(log: Log = console.log) {
  const { conn, k, s } = ctx();
  const msPda = pk(s.multisig);
  const sigs: string[] = [];
  let acc = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  if (acc.timeLock > 0) {
    log("… multisig has a timelock; a vault transaction can't execute before it expires. Removing it first (this is itself an alert).");
    sigs.push(await removeTimelock(log));
    acc = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  }
  const index = BigInt(acc.transactionIndex.toString()) + 1n;
  const vault = pk(s.vaultPda);
  const message = new TransactionMessage({ payerKey: vault, recentBlockhash: (await conn.getLatestBlockhash()).blockhash, instructions: [setAuthorityIx(programDataOf(pk(s.demoProgram)), vault, k.attacker.publicKey)] });
  sigs.push(await send(conn, [
    multisig.instructions.vaultTransactionCreate({ multisigPda: msPda, transactionIndex: index, creator: k.admin.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: message }),
    multisig.instructions.proposalCreate({ multisigPda: msPda, transactionIndex: index, creator: k.admin.publicKey }),
    multisig.instructions.proposalApprove({ multisigPda: msPda, transactionIndex: index, member: k.admin.publicKey }),
    ...(acc.threshold > 1 ? [multisig.instructions.proposalApprove({ multisigPda: msPda, transactionIndex: index, member: k.signerA.publicKey })] : []),
  ], acc.threshold > 1 ? [k.admin, k.signerA] : [k.admin], log, `Propose + approve vault tx #${index} (SetAuthority → single key)`));
  const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({ connection: conn, multisigPda: msPda, transactionIndex: index, member: k.admin.publicKey });
  void lookupTableAccounts;
  sigs.push(await send(conn, [instruction], [k.admin], log, "Execute: upgrade authority → single key"));
  return sigs[sigs.length - 1]!;
}

export async function reset(log: Log = console.log) {
  const { conn, k, s } = ctx();
  const msPda = pk(s.multisig);
  const acc = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  const ixs: TransactionInstruction[] = [];
  if (acc.threshold !== 2) ixs.push(multisig.instructions.multisigChangeThreshold({ multisigPda: msPda, configAuthority: k.admin.publicKey, rentPayer: k.admin.publicKey, newThreshold: 2 }));
  if (acc.timeLock !== TWO_DAYS) ixs.push(multisig.instructions.multisigSetTimeLock({ multisigPda: msPda, configAuthority: k.admin.publicKey, timeLock: TWO_DAYS }));
  if (ixs.length) await send(conn, ixs, [k.admin], log, "Restore threshold 2 + 2-day timelock");
  // upgrade authority back to the vault
  const pd = await conn.getAccountInfo(programDataOf(pk(s.demoProgram)));
  const auth = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)) : null;
  if (auth?.equals(k.attacker.publicKey)) await send(conn, [setAuthorityIx(programDataOf(pk(s.demoProgram)), k.attacker.publicKey, pk(s.vaultPda))], [k.admin, k.attacker], log, "Return upgrade authority to the multisig vault");
  // close signer nonce accounts
  const nonces = await conn.getProgramAccounts(SystemProgram.programId, { filters: [{ dataSize: NONCE_ACCOUNT_LENGTH }, { memcmp: { offset: 8, bytes: k.signerA.publicKey.toBase58() } }] });
  for (const n of nonces) {
    await send(conn, [SystemProgram.nonceWithdraw({ noncePubkey: n.pubkey, authorizedPubkey: k.signerA.publicKey, toPubkey: k.admin.publicKey, lamports: n.account.lamports })], [k.admin, k.signerA], log, `Close nonce ${n.pubkey.toBase58().slice(0, 6)}…`);
  }
  // new demo epoch: older demo events stop counting toward "recent weakening"
  const d = db();
  const [row] = await d.select().from(protocols).where(eq(protocols.slug, DEMO_SLUG));
  if (row) await d.update(protocols).set({ config: { ...(row.config as object), demoResetAt: new Date().toISOString() } }).where(eq(protocols.id, row.id));
  log("✔ demo epoch reset — the indexer will publish a green score; the keeper re-arms the shielded position");
}

/** Manager re-arms the shielded position (only succeeds once the registry is no longer red), then re-allocates. */
export async function rearmVault(log: Log = console.log) {
  const { conn, k, s } = ctx();
  const vix = new VaultIx(pk(s.mint), process.env.VAULT_PROGRAM_ID || undefined, process.env.REGISTRY_PROGRAM_ID || undefined);
  const pos = await conn.getAccountInfo(vix.position(DEMO_SLUG));
  if (!pos || pos.data[112] !== 1) return null;
  return send(conn, [vix.resetPosition(k.admin.publicKey, DEMO_SLUG), vix.allocate(k.admin.publicKey, DEMO_SLUG, 40_000_000_000n)], [k.admin], log, "Re-arm position + re-allocate 40,000");
}

export const ACTIONS = { "remove-timelock": removeTimelock, "lower-threshold": (l: Log) => lowerThreshold(l, 1), "create-signer-nonce": createSignerNonce, "transfer-authority": transferAuthority, reset } as const;
export type ActionName = keyof typeof ACTIONS;
export { send } from "./tx";
export { connection, keys } from "./env";
