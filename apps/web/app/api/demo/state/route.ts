import { hasState, loadState, connection } from "@overwatch/demo";
import { VaultIx, decodePosition, decodeVault } from "@overwatch/sdk/tx";
import { fetchRiskRecord } from "@overwatch/sdk";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live devnet state of the demo: multisig config, upgrade authority, registry record, vault + position. */
export async function GET() {
  if (!hasState()) return Response.json({ ready: false, demoMode: process.env.DEMO_MODE === "true" });
  const s = loadState();
  const conn = connection();
  const vix = new VaultIx(new PublicKey(s.mint), process.env.VAULT_PROGRAM_ID, process.env.REGISTRY_PROGRAM_ID);
  const [ms, vaultAcc, posAcc, idleBal, pd, risk] = await Promise.all([
    multisig.accounts.Multisig.fromAccountAddress(conn, new PublicKey(s.multisig)).catch(() => null),
    conn.getAccountInfo(vix.vault()),
    conn.getAccountInfo(vix.position(s.slug)),
    conn.getTokenAccountBalance(vix.idle()).catch(() => null),
    conn.getAccountInfo(PublicKey.findProgramAddressSync([new PublicKey(s.demoProgram).toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0], { dataSlice: { offset: 0, length: 45 } }),
    fetchRiskRecord(conn.rpcEndpoint, s.slug, process.env.REGISTRY_PROGRAM_ID).catch(() => null),
  ]);
  const pos = posAcc ? decodePosition(posAcc.data) : null;
  const vault = vaultAcc ? decodeVault(vaultAcc.data) : null;
  const auth = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
  return Response.json({
    ready: true, demoMode: process.env.DEMO_MODE === "true", state: s,
    multisig: ms ? { threshold: ms.threshold, members: ms.members.length, timeLock: ms.timeLock, configAuthority: ms.configAuthority.toBase58() } : null,
    upgradeAuthority: auth, authorityIsVault: auth === s.vaultPda,
    risk: risk ? { score: risk.score, grade: risk.grade, flags: risk.flags.toString(), red: risk.red, version: risk.version } : null,
    vault: vault ? { totalAllocated: vault.totalAllocated.toString(), minScore: vault.minScore, idle: idleBal?.value.uiAmountString ?? "0", mint: s.mint, shareMint: vix.shareMint().toBase58(), address: vix.vault().toBase58() } : null,
    position: pos ? { allocated: pos.allocated.toString(), shielded: pos.shielded, address: vix.position(s.slug).toBase58() } : null,
  });
}
