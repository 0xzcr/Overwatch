import { and, desc, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import { db, sql, CHANNEL } from "./client";
import { events, protocols, scores, snapshots, onchainPublishes } from "./schema";

const SEV = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const severitiesAtLeast = (s: string) => SEV.slice(Math.max(0, SEV.indexOf(s.toUpperCase())));

/** Protocol ids for subscription slugs, plus any slug that matched nothing (an empty id list would mean "all protocols"). */
export async function protocolIdsForSlugs(slugs: string[]) {
  const rows = await db().select({ id: protocols.id, slug: protocols.slug }).from(protocols).where(inArray(protocols.slug, slugs));
  return { ids: rows.map((r) => r.id), unknown: slugs.filter((s) => !rows.some((r) => r.slug === s)) };
}

export async function listProtocols() {
  const d = db();
  // Independent reads, so they share one round trip of latency instead of four.
  const [rows, latestScores, latestSnaps, lastEvents] = await Promise.all([
    d.select().from(protocols).orderBy(protocols.name),
    d.execute<{ protocol_id: number; score: number; grade: string; flags: string; breakdown: unknown; computed_at: string }>(dsql`
      select distinct on (protocol_id) protocol_id, score, grade, flags::text, breakdown, computed_at from scores order by protocol_id, computed_at desc`),
    d.execute<{ protocol_id: number; data: unknown; created_at: string }>(dsql`
      select distinct on (protocol_id) protocol_id, data, created_at from snapshots order by protocol_id, created_at desc`),
    d.execute<{ protocol_id: number; last: string }>(dsql`select protocol_id, max(coalesce(block_time, detected_at)) as last from events where severity <> 'INFO' group by protocol_id`),
  ]);
  const sm = new Map(latestScores.map((r) => [r.protocol_id, r]));
  const nm = new Map(latestSnaps.map((r) => [r.protocol_id, r]));
  const em = new Map(lastEvents.map((r) => [r.protocol_id, r.last]));
  return rows.map((p) => ({ ...p, score: sm.get(p.id) ?? null, snapshot: nm.get(p.id)?.data ?? null, snapshotAt: nm.get(p.id)?.created_at ?? null, lastChange: em.get(p.id) ?? null }));
}

export async function getProtocol(slug: string) {
  const all = await listProtocols();
  return all.find((p) => p.slug === slug) ?? null;
}

export async function listEvents(opts: { protocolId?: number; minSeverity?: string; since?: Date; limit?: number; sources?: string[] } = {}) {
  const conds = [];
  if (opts.protocolId) conds.push(eq(events.protocolId, opts.protocolId));
  if (opts.minSeverity) conds.push(inArray(events.severity, severitiesAtLeast(opts.minSeverity)));
  if (opts.since) conds.push(gte(events.detectedAt, opts.since));
  if (opts.sources) conds.push(inArray(events.source, opts.sources));
  return db()
    .select({ e: events, slug: protocols.slug, name: protocols.name })
    .from(events)
    .innerJoin(protocols, eq(events.protocolId, protocols.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(dsql`coalesce(${events.blockTime}, ${events.detectedAt})`), desc(events.id))
    .limit(opts.limit ?? 100);
}

export async function scoreHistory(protocolId: number) {
  return db().select().from(scores).where(eq(scores.protocolId, protocolId)).orderBy(desc(scores.computedAt)).limit(500);
}

export async function latestSnapshot(protocolId: number) {
  const [r] = await db().select().from(snapshots).where(eq(snapshots.protocolId, protocolId)).orderBy(desc(snapshots.createdAt)).limit(1);
  return r ?? null;
}

export async function recentPublishes(limit = 50) {
  return db().select({ p: onchainPublishes, slug: protocols.slug }).from(onchainPublishes).innerJoin(protocols, eq(onchainPublishes.protocolId, protocols.id)).orderBy(desc(onchainPublishes.createdAt)).limit(limit);
}

export async function notify(payload: Record<string, unknown>) {
  await sql().notify(CHANNEL, JSON.stringify(payload));
}
