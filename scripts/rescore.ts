/**
 * Re-grades every protocol from its latest stored snapshot, with no RPC calls. Run it after a ruleset change or an
 * edit to config/protocols.yaml (such as admin_limits): it copies each protocol's config from the YAML, then
 * re-ingests the last snapshot so a new score row is written under the current ruleset. Re-ingesting an unchanged
 * snapshot creates no control-change events.
 *
 *   pnpm exec tsx scripts/rescore.ts
 */
import type { ControlSnapshot } from "@overwatch/core";
import { db, sql, protocols, snapshots, ingestSnapshot, eq, desc } from "@overwatch/db";
import { loadWatchList } from "./lib";

const watchList = new Map(loadWatchList().map((cfg) => [cfg.slug, cfg]));
const rows = await db().select().from(protocols);

const graded: string[] = [];
for (const row of rows) {
  const cfg = watchList.get(row.slug);
  // private watches and protocols dropped from the YAML keep the config they have
  const current = cfg
    ? { ...cfg, verified: (row.config as { verified?: boolean }).verified ?? cfg.verified }
    : row.config;
  if (cfg) await db().update(protocols).set({ config: current }).where(eq(protocols.id, row.id));

  const [latest] = await db()
    .select()
    .from(snapshots)
    .where(eq(snapshots.protocolId, row.id))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(1);
  if (!latest) continue;
  const result = await ingestSnapshot({ ...row, config: current }, latest.data as ControlSnapshot, { source: "live" });
  graded.push(`${row.slug.padEnd(20)} ${result.score.grade}${result.score.red ? "  red" : ""}`);
}
console.log(graded.join("\n"));
await sql().end();
