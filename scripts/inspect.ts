/** pnpm inspect <programId> [--devnet] [--multisig <addr>] — read-only control report for any program. */
import { mainnetRpc, devnetRpc } from "@overwatch/solana";
import { collectSnapshot, scoreSnapshot, AUTHORITY_LABEL, fmtDuration, flagNames } from "@overwatch/core";
import { discoverSquadsMultisig } from "./discover";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--multisig");
if (!id) { console.error("usage: pnpm inspect <programId> [--devnet] [--multisig <addr>]"); process.exit(1); }
const rpc = args.includes("--devnet") ? devnetRpc() : mainnetRpc();
const msArg = args.includes("--multisig") ? args[args.indexOf("--multisig") + 1] : undefined;

const base = { slug: "inspect", name: id, category: "infra" as const, website: "https://example.com", docs_sources: [], admin_accounts: [], collateral_mints: [], oracles: [], verified: false, source: "config" as const, network: "mainnet" as const, programs: [{ id, label: "program" }] };
let { snapshot } = await collectSnapshot(rpc, { ...base, multisigs: [] }, { scanProposals: false });
const prog = snapshot.programs[0];
if (!prog) { console.error(`✘ ${id} is not an upgradeable-loader program (or does not exist)`); process.exit(2); }

let multisig = msArg ? { multisig: msArg, vaultIndex: 0 } : null;
if (!multisig && prog.authorityKind === "OTHER_PROGRAM_PDA" && prog.upgradeAuthority) {
  process.stdout.write("… authority is a PDA; searching its transaction history for a Squads v4 multisig\n");
  multisig = await discoverSquadsMultisig(rpc, prog.upgradeAuthority);
}
if (multisig) {
  ({ snapshot } = await collectSnapshot(rpc, { ...base, multisigs: [{ address: multisig.multisig, vault_index: multisig.vaultIndex, role: "upgrade_authority" }] }, { scanNonces: true, scanProposals: true }));
}
const p = snapshot.programs[0]!;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
console.log(`\n${bold("PROGRAM")}          ${p.programId}`);
console.log(`ProgramData      ${p.programDataAddress}`);
console.log(`Last deploy slot ${p.lastDeploySlot}`);
console.log(`Upgrade auth     ${p.upgradeAuthority ?? "none"}`);
console.log(`Authority type   ${p.authorityKind} — ${AUTHORITY_LABEL[p.authorityKind]}`);
for (const m of snapshot.multisigs) {
  console.log(`\n${bold("SQUADS V4 MULTISIG")} ${m.address} (vault index ${m.vaultIndex})`);
  console.log(`Threshold        ${m.threshold} of ${m.members.length}`);
  console.log(`Timelock         ${fmtDuration(m.timeLockSec)} (${m.timeLockSec}s)`);
  console.log(`Config authority ${m.configAuthority ?? "none (changes need a vote)"}`);
  console.log(`Tx index         ${m.transactionIndex} (stale ≤ ${m.staleTransactionIndex})`);
  console.log(`Pending config   ${m.pending.length ? m.pending.map((x) => `#${x.transactionIndex} ${x.actions.map((a) => a.kind).join(",")}`).join("; ") : "none"}`);
  console.log(bold("Signers"));
  for (const s of m.members) {
    const n = snapshot.nonces.filter((x) => x.authority === s.key);
    console.log(`  ${s.key}  perms=${s.permissions}  nonce accounts: ${n.length ? n.map((x) => x.address).join(", ") : "none"}`);
  }
}
const sc = scoreSnapshot(snapshot, []);
console.log(`\n${bold("SCORE")} ${sc.score}/100  grade ${sc.grade}  flags [${flagNames(sc.flags).join(", ") || "none"}]${sc.red ? "  \x1b[31mRED\x1b[0m" : ""}`);
for (const d of sc.breakdown) console.log(`  −${d.points}  ${d.reason}`);
