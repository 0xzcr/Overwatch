/**
 * Historical backfill (read-only, mainnet). For each watched multisig and ProgramData account, walk
 * getSignaturesForAddress back ~180 days and parse:
 *   - BPF upgradeable loader Upgrade (3) / SetAuthority (4) / SetAuthorityChecked (7), top-level or CPI (via Squads vault txs)
 *   - Squads v4 config executions (configTransactionExecute + controlled-multisig direct config instructions)
 * Usage: pnpm backfill [slug...] [--days 180] [--max 400]
 */
import bs58 from "bs58";
import { z } from "zod";
import { mainnetRpc, devnetRpc, type Rpc } from "@overwatch/solana";
import { decodeConfigTransaction, fmtDuration, short, BPF_UPGRADEABLE_LOADER, SQUADS_V4, type ControlSnapshot, type ConfigActionLite } from "@overwatch/core";
import { db, sql, protocols, events, latestSnapshot } from "@overwatch/db";

const args = process.argv.slice(2);
const flag = (k: string, d: number) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const DAYS = flag("--days", 180), MAX = flag("--max", 400);
const only = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const D = (a: number[]) => bs58.encode(Uint8Array.from(a));
const SQ = {
  configExecute: [114, 146, 244, 189, 252, 140, 36, 40], setTimeLock: [148, 154, 121, 77, 212, 254, 155, 72], changeThreshold: [141, 42, 15, 126, 169, 92, 62, 181],
  addMember: [1, 219, 215, 108, 184, 229, 214, 8], removeMember: [217, 117, 177, 210, 182, 145, 218, 72], setConfigAuthority: [143, 93, 199, 143, 92, 169, 193, 232],
};
void D;

const ix = z.object({ programIdIndex: z.number(), accounts: z.array(z.number()), data: z.string() });
const txSchema = z.object({
  slot: z.number(), blockTime: z.number().nullable(),
  meta: z.object({ err: z.unknown(), innerInstructions: z.array(z.object({ index: z.number(), instructions: z.array(ix) })).nullable().optional(), loadedAddresses: z.object({ writable: z.array(z.string()), readonly: z.array(z.string()) }).optional() }).nullable(),
  transaction: z.object({ signatures: z.array(z.string()), message: z.object({ accountKeys: z.array(z.string()), instructions: z.array(ix) }) }),
});

interface Found { type: string; severity: string; weakening: boolean; title: string; explanation: string; after: unknown }

const startsWith = (d: Uint8Array, p: number[]) => p.every((b, i) => d[i] === b);

function describeActions(name: string, actions: ConfigActionLite[]): Found {
  const parts = actions.map((a) => a.kind === "SetTimeLock" ? `set timelock to ${fmtDuration(a.newTimeLock)}` : a.kind === "ChangeThreshold" ? `set threshold to ${a.newThreshold}` : a.kind === "AddMember" ? `added signer ${short(a.key)}` : a.kind === "RemoveMember" ? `removed signer ${short(a.key)}` : a.kind === "SetRentCollector" ? "changed rent collector" : a.name);
  const risky = actions.some((a) => (a.kind === "SetTimeLock" && a.newTimeLock === 0) || (a.kind === "ChangeThreshold" && a.newThreshold <= 2));
  return { type: "MULTISIG_CONFIG_EXECUTED", severity: risky ? "HIGH" : "MEDIUM", weakening: risky, title: `${name} multisig config change: ${parts.join(", ")}`, explanation: `A Squads configuration transaction executed: ${parts.join("; ")}. Historical event, reconstructed from onchain data.`, after: { actions } };
}

async function parseTx(rpc: Rpc, sig: string, name: string, watched: Set<string>): Promise<{ found: Found[]; slot: number; blockTime: number | null }> {
  const raw = await rpc.call("getTransaction", [sig, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  if (!raw) return { found: [], slot: 0, blockTime: null };
  const tx = txSchema.parse(raw);
  if (tx.meta?.err) return { found: [], slot: tx.slot, blockTime: tx.blockTime };
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
  const all = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap((x) => x.instructions)];
  const found: Found[] = [];
  for (const i of all) {
    const program = keys[i.programIdIndex];
    const data = bs58.decode(i.data);
    const acc = (n: number) => keys[i.accounts[n]!]!;
    if (program === BPF_UPGRADEABLE_LOADER && data.length >= 4) {
      const tag = new DataView(data.buffer, data.byteOffset).getUint32(0, true);
      if (tag === 3 && watched.has(acc(0))) found.push({ type: "PROGRAM_UPGRADED", severity: "MEDIUM", weakening: false, title: `${name} deployed new program code`, explanation: `ProgramData ${short(acc(0))} was upgraded. Historical event from chain data.`, after: { programData: acc(0) } });
      if ((tag === 4 || tag === 7) && watched.has(acc(0))) {
        const next = i.accounts.length > 2 ? acc(2) : null;
        found.push({ type: "UPGRADE_AUTHORITY_CHANGED", severity: "CRITICAL", weakening: true, title: next ? `${name}'s upgrade authority moved to ${short(next)}` : `${name}'s program was made immutable`, explanation: `SetAuthority on ProgramData ${short(acc(0))}: ${short(acc(1))} → ${next ? short(next) : "none"}.`, after: { from: acc(1), to: next } });
      }
    }
    if (program === SQUADS_V4 && watched.has(acc(0))) {
      if (startsWith(data, SQ.configExecute)) {
        const cfgTx = acc(3);
        const a = await rpc.getAccount(cfgTx).catch(() => null);
        if (a) { try { found.push(describeActions(name, decodeConfigTransaction(a.data).actions)); continue; } catch { /* closed or reused */ } }
        found.push({ type: "MULTISIG_CONFIG_EXECUTED", severity: "MEDIUM", weakening: false, title: `${name} executed a multisig config change`, explanation: `Squads configTransactionExecute (config transaction ${short(cfgTx)}, since closed, so details are unavailable).`, after: { configTransaction: cfgTx } });
      }
      const direct: [number[], string][] = [[SQ.setTimeLock, "set timelock"], [SQ.changeThreshold, "changed threshold"], [SQ.addMember, "added a member"], [SQ.removeMember, "removed a member"], [SQ.setConfigAuthority, "changed config authority"]];
      for (const [d, label] of direct) if (startsWith(data, d)) found.push({ type: "MULTISIG_CONFIG_EXECUTED", severity: "HIGH", weakening: true, title: `${name}'s config authority ${label} without a vote`, explanation: `A controlled-multisig instruction (${label}) executed directly by the config authority.`, after: { instruction: label } });
    }
  }
  return { found, slot: tx.slot, blockTime: tx.blockTime };
}

const rows = (await db().select().from(protocols)).filter((p) => !only.length || only.includes(p.slug));
const cutoff = Date.now() / 1000 - DAYS * 86400;
for (const p of rows) {
  const snap = (await latestSnapshot(p.id))?.data as ControlSnapshot | undefined;
  if (!snap) continue;
  const rpc = p.network === "devnet" ? devnetRpc() : mainnetRpc();
  const targets = [...snap.multisigs.map((m) => m.address), ...snap.programs.map((x) => x.programDataAddress)];
  const watched = new Set(targets);
  let n = 0, written = 0;
  for (const t of targets) {
    let before: string | undefined;
    let done = false;
    while (!done && n < MAX) {
      const sigs = await rpc.getSignaturesForAddress(t, { before, limit: 1000 });
      if (!sigs.length) break;
      for (const s of sigs) {
        if ((s.blockTime ?? 0) < cutoff || n >= MAX) { done = true; break; }
        if (s.err) continue;
        n++;
        const r = await parseTx(rpc, s.signature, p.name, watched).catch(() => ({ found: [] as Found[], slot: 0, blockTime: null }));
        for (const f of r.found) {
          const ins = await db().insert(events).values({ protocolId: p.id, type: f.type, severity: f.severity, weakening: f.weakening, title: f.title, explanation: f.explanation, labels: [], after: f.after, slot: r.slot, blockTime: r.blockTime ? new Date(r.blockTime * 1000) : null, txSignature: s.signature, source: "backfill", detectedAt: r.blockTime ? new Date(r.blockTime * 1000) : new Date() }).onConflictDoNothing().returning({ id: events.id });
          written += ins.length;
        }
      }
      before = sigs.at(-1)!.signature;
      if (sigs.length < 1000) break;
    }
  }
  console.log(`${p.slug.padEnd(20)} scanned ${String(n).padStart(4)} txs → ${written} historical events`);
}
await sql().end();
