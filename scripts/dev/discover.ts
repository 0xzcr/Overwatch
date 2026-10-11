import { mainnetRpc } from "../../packages/solana/src/index";
import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
const rpc = mainnetRpc();
const SQ = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
for (const auth of process.argv.slice(2)) {
  const sigs = await rpc.getSignaturesForAddress(auth, { limit: 15 });
  let found = "";
  outer: for (const s of sigs) {
    const tx = await rpc.getTransaction(s.signature);
    if (!tx) continue;
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
    if (!keys.includes(SQ)) continue;
    const accs = await rpc.getMultipleAccounts(keys);
    for (const a of accs) {
      if (!a || a.owner !== SQ) continue;
      try {
        const [m] = multisig.accounts.Multisig.fromAccountInfo({ data: Buffer.from(a.data), owner: new PublicKey(SQ), lamports: a.lamports, executable: false } as never);
        for (let i = 0; i < 8; i++) {
          const [v] = multisig.getVaultPda({ multisigPda: new PublicKey(a.address), index: i });
          if (v.toBase58() === auth) { found = `${a.address} idx=${i} thr=${m.threshold}/${m.members.length} tl=${m.timeLock} cfgAuth=${m.configAuthority.toBase58()}`; break outer; }
        }
      } catch {}
    }
  }
  console.log(auth, "=>", found || `none (sigs=${sigs.length})`);
}
