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
import { decodeConfigTransaction, classifyConfigActions, short, BPF_UPGRADEABLE_LOADER, SQUADS_V4, type ControlSnapshot, type ConfigActionLite, type ReplayState } from "@overwatch/core";
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

/**
 * `config` marks a change to a multisig's settings. Decoded ones (actions) are graded later, once the multisig's history
 * is in order; undecodable ones (actions: null) keep their text and make the replay forget what it knew.
 */
interface Found { type: string; severity: string; weakening: boolean; title: string; explanation: string; after: unknown; config?: { multisig: string; actions: ConfigActionLite[] | null } }

const startsWith = (d: Uint8Array, p: number[]) => p.every((b, i) => d[i] === b);

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
      if (tag === 3 && watched.has(acc(0)))
        found.push({ type: "PROGRAM_UPGRADED", severity: "MEDIUM", weakening: false, title: `${name} deployed new program code`, explanation: `The upgrade authority replaced the program's code (program data ${short(acc(0))}). A routine release looks exactly like this, and so would a malicious one, so check that the team announced it.`, after: { programData: acc(0) } });
      if ((tag === 4 || tag === 7) && watched.has(acc(0))) {
        const next = i.accounts.length > 2 ? acc(2) : null;
        found.push(next
          ? { type: "UPGRADE_AUTHORITY_CHANGED", severity: "CRITICAL", weakening: true, title: `${name} handed control of its program to ${short(next)}`, explanation: `The key allowed to replace this program's code changed from ${short(acc(1))} to ${short(next)}. Check that the team announced the handover; an unannounced one is how takeovers start.`, after: { programData: acc(0), from: acc(1), to: next } }
          : { type: "PROGRAM_MADE_IMMUTABLE", severity: "INFO", weakening: false, title: `${name} locked its program code for good`, explanation: `The upgrade authority was removed, so nobody, including the team, can change this program's code anymore (program data ${short(acc(0))}).`, after: { programData: acc(0), from: acc(1), to: null } });
      }
    }
    if (program === SQUADS_V4 && watched.has(acc(0))) {
      if (startsWith(data, SQ.configExecute)) {
        const cfgTx = acc(3);
        const a = await rpc.getAccount(cfgTx).catch(() => null);
        if (a) {
          try {
            const { actions } = decodeConfigTransaction(a.data);
            found.push({ type: "MULTISIG_CONFIG_EXECUTED", severity: "MEDIUM", weakening: false, title: "", explanation: "", after: { actions }, config: { multisig: acc(0), actions } });
            continue;
          } catch { /* closed or reused */ }
        }
        found.push({ type: "MULTISIG_CONFIG_EXECUTED", severity: "MEDIUM", weakening: false, title: `${name} changed its multisig settings`, explanation: `Squads has since deleted the record of this change (${short(cfgTx)}), so we can't tell what moved. Its current settings are on the protocol page.`, after: { configTransaction: cfgTx }, config: { multisig: acc(0), actions: null } });
      }
      const direct: [number[], string][] = [[SQ.setTimeLock, "changed the safety delay"], [SQ.changeThreshold, "changed how many approvals are needed"], [SQ.addMember, "added a signer"], [SQ.removeMember, "removed a signer"], [SQ.setConfigAuthority, "handed control of the multisig to another key"]];
      for (const [d, label] of direct)
        if (startsWith(data, d))
          found.push({ type: "MULTISIG_CONFIG_EXECUTED", severity: "HIGH", weakening: true, title: `One key ${label} on ${name}'s multisig, without a vote`, explanation: `The multisig's config authority acted alone; the other signers did not approve. While one key can rewrite the multisig, the multisig protects nothing.`, after: { instruction: label }, config: { multisig: acc(0), actions: null } });
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
  // A transaction can touch several watched accounts; parse it once so a config change is not replayed twice.
  const seen = new Set<string>();
  const hits: { f: Found; slot: number; blockTime: number | null; sig: string }[] = [];
  for (const t of targets) {
    let before: string | undefined;
    let done = false;
    while (!done && n < MAX) {
      const sigs = await rpc.getSignaturesForAddress(t, { before, limit: 1000 });
      if (!sigs.length) break;
      for (const s of sigs) {
        if ((s.blockTime ?? 0) < cutoff || n >= MAX) { done = true; break; }
        if (s.err || seen.has(s.signature)) continue;
        seen.add(s.signature);
        n++;
        const r = await parseTx(rpc, s.signature, p.name, watched).catch(() => ({ found: [] as Found[], slot: 0, blockTime: null }));
        for (const f of r.found) hits.push({ f, slot: r.slot, blockTime: r.blockTime, sig: s.signature });
      }
      before = sigs.at(-1)!.signature;
      if (sigs.length < 1000) break;
    }
  }
  // Oldest first, so each config change is graded against the multisig's previous settings.
  hits.sort((a, b) => a.slot - b.slot);
  // Signer count when the scanned history starts: today's count minus the net change since. Only exact when every change
  // to that multisig in the window was decoded, so otherwise titles skip the "of N".
  const startMembers = new Map<string, number>();
  for (const m of snap.multisigs) {
    const mine = hits.flatMap((h) => (h.f.config?.multisig === m.address ? [h.f.config.actions] : []));
    if (mine.some((a) => !a)) continue;
    const net = mine.flat().reduce((s, a) => s + (a!.kind === "AddMember" ? 1 : a!.kind === "RemoveMember" ? -1 : 0), 0);
    startMembers.set(m.address, m.members.length - net);
  }
  const state = new Map<string, ReplayState>();
  for (const { f, slot, blockTime, sig } of hits) {
    if (f.config && !f.config.actions) state.set(f.config.multisig, {}); // unknown change: forget what we knew
    else if (f.config?.actions) {
      const st = state.get(f.config.multisig) ?? { members: startMembers.get(f.config.multisig) };
      state.set(f.config.multisig, st);
      Object.assign(f, classifyConfigActions(p.name, f.config.actions, st));
    }
    const at = blockTime ? new Date(blockTime * 1000) : null;
    const ins = await db().insert(events).values({ protocolId: p.id, type: f.type, severity: f.severity, weakening: f.weakening, title: f.title, explanation: f.explanation, labels: [], after: f.after, slot, blockTime: at, txSignature: sig, source: "backfill", detectedAt: at ?? new Date() }).onConflictDoNothing().returning({ id: events.id });
    written += ins.length;
  }
  console.log(`${p.slug.padEnd(20)} scanned ${String(n).padStart(4)} txs → ${written} historical events`);
}
await sql().end();
