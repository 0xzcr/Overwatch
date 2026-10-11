/** Find the Squads v4 multisig behind a PDA authority by walking its tx history, then verify by vault-PDA derivation. */
import type { Rpc } from "@overwatch/solana";
import { SQUADS_V4, isMultisigAccount, findVaultIndex } from "@overwatch/core";

export async function discoverSquadsMultisig(rpc: Rpc, authority: string, maxTx = 40): Promise<{ multisig: string; vaultIndex: number } | null> {
  const sigs = await rpc.getSignaturesForAddress(authority, { limit: maxTx });
  const seen = new Set<string>();
  for (const s of sigs) {
    const tx = await rpc.getTransaction(s.signature).catch(() => null);
    if (!tx) continue;
    const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
    if (!keys.includes(SQUADS_V4)) continue;
    const fresh = keys.filter((k) => !seen.has(k));
    fresh.forEach((k) => seen.add(k));
    const accs = await rpc.getMultipleAccounts(fresh);
    for (const a of accs) {
      if (!a || a.owner !== SQUADS_V4 || !isMultisigAccount(a.data)) continue;
      const idx = findVaultIndex(a.address, authority);
      if (idx !== null) return { multisig: a.address, vaultIndex: idx };
    }
  }
  return null;
}
