/**
 * Loads config/protocols.yaml, verifies every address onchain (mainnet, read-only), stores protocols + watched
 * accounts + an initial snapshot/score, and prints a verification report. Anything that fails stays verified=false.
 */
import { mainnetRpc, devnetRpc } from "@overwatch/solana";
import { collectSnapshot, AUTHORITY_LABEL, findVaultIndex, type ProtocolConfig } from "@overwatch/core";
import { db, sql, protocols, watchedAccounts, ingestSnapshot, eq } from "@overwatch/db";
import { loadWatchList, table } from "./lib";
import { discoverSquadsMultisig } from "./discover";
import { fetchTvl } from "./tvl";

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const list = loadWatchList().filter((p) => !only.length || only.includes(p.slug));
const report: Record<string, string | number | boolean>[] = [];
const d = db();

for (const cfg0 of list) {
  const cfg: ProtocolConfig = structuredClone(cfg0);
  const rpc = cfg.network === "devnet" ? devnetRpc() : mainnetRpc();
  const problems: string[] = [];
  cfg.verified = false;
  const { snapshot, warnings } = await collectSnapshot(rpc, cfg, { scanNonces: false, scanProposals: true });
  problems.push(...warnings.filter((w) => !w.startsWith("proposals")));

  // every program must decode
  if (snapshot.programs.length !== cfg.programs.length) problems.push("program(s) failed to decode");
  // every mapped upgrade multisig must derive one of the program authorities
  for (const m of cfg.multisigs.filter((x) => x.role === "upgrade_authority")) {
    const ok = snapshot.programs.some((p) => p.upgradeAuthority && findVaultIndex(m.address, p.upgradeAuthority) === m.vault_index);
    if (!ok) problems.push(`multisig ${m.address} does not derive any program authority at vault index ${m.vault_index}`);
  }
  // try discovery for unmapped PDA authorities
  for (const p of snapshot.programs.filter((x) => x.authorityKind === "OTHER_PROGRAM_PDA" && x.upgradeAuthority)) {
    const found = await discoverSquadsMultisig(rpc, p.upgradeAuthority!, 40).catch(() => null);
    if (found) console.log(`  ↳ ${cfg.slug}: discovered Squads multisig ${found.multisig} (vault ${found.vaultIndex}) — add to protocols.yaml`);
  }
  const verified = problems.length === 0;
  const final = verified ? (await collectSnapshot(rpc, { ...cfg, verified: true }, { scanNonces: false })).snapshot : snapshot;
  const tvl = cfg.defillama_slug ? await fetchTvl(cfg.defillama_slug) : null;

  const values = {
    slug: cfg.slug, name: cfg.name, category: cfg.category, website: cfg.website, defillamaSlug: cfg.defillama_slug ?? null,
    network: cfg.network, source: cfg.source, config: { ...cfg, verified }, verified, verification: { checkedAt: new Date().toISOString(), problems },
    tvlUsd: tvl, tvlFetchedAt: tvl ? new Date() : null,
  };
  const [row] = await d.insert(protocols).values(values).onConflictDoUpdate({ target: protocols.slug, set: values }).returning();
  await d.delete(watchedAccounts).where(eq(watchedAccounts.protocolId, row!.id));
  const wa = [
    ...final.programs.flatMap((p) => [
      { kind: "program", address: p.programId, label: p.label },
      { kind: "programdata", address: p.programDataAddress, label: `${p.label} (ProgramData)` },
    ]),
    ...cfg.multisigs.map((m) => ({ kind: "multisig", address: m.address, label: m.role })),
    ...cfg.collateral_mints.map((m) => ({ kind: "mint", address: m, label: "collateral" })),
    ...cfg.oracles.map((m) => ({ kind: "oracle", address: m, label: "oracle" })),
    ...cfg.admin_accounts.map((m) => ({ kind: "admin", address: m, label: "admin config" })),
  ];
  if (wa.length) await d.insert(watchedAccounts).values(wa.map((w) => ({ ...w, protocolId: row!.id, verified }))).onConflictDoNothing();
  const r = await ingestSnapshot(row!, final, { source: "live" });

  const ms = final.multisigs[0];
  report.push({
    protocol: cfg.slug, verified: verified ? "✔" : "✘", authority: [...new Set(final.programs.map((p) => p.authorityKind))].join("+"),
    multisig: ms ? `${ms.threshold}/${ms.members.length}` : "-", timelock: ms ? `${ms.timeLockSec}s` : "-",
    grade: `${r.score.grade} ${r.score.score}`, problems: problems.join("; ").slice(0, 70) || "-",
  });
}

table(report);
console.log(`\nAuthority kinds: ${Object.entries(AUTHORITY_LABEL).map(([k, v]) => `${k}=${v}`).join(", ")}`);
await sql().end();
