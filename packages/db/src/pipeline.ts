import { desc, eq, gte, and } from "drizzle-orm";
import { diffSnapshots, scoreSnapshot, snapshotHash, type ControlSnapshot, type OverwatchEvent } from "@overwatch/core";
import { db, sql, CHANNEL } from "./client";
import { events, protocols, scores, snapshots, subscriptions, deliveries } from "./schema";
import { severitiesAtLeast } from "./queries";

type ProtocolRow = typeof protocols.$inferSelect;
export interface IngestResult { stored: boolean; events: (OverwatchEvent & { id: number })[]; score: ReturnType<typeof scoreSnapshot> }

const DAY = 86_400_000;

/** Store snapshot if changed, diff vs previous, persist events, rescore, NOTIFY and enqueue deliveries. */
export async function ingestSnapshot(p: ProtocolRow, snap: ControlSnapshot, o: { source: "live" | "backfill" | "demo"; txSignature?: string | null; blockTime?: string | null; force?: boolean } = { source: "live" }): Promise<IngestResult> {
  const d = db();
  const hash = snapshotHash(snap);
  const [prev] = await d.select().from(snapshots).where(eq(snapshots.protocolId, p.id)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).limit(1);
  // demo protocols start a fresh "epoch" on reset so old demo events stop counting as recent
  const resetAt = (p.config as { demoResetAt?: string } | null)?.demoResetAt;
  const since = new Date(Math.max(Date.now() - 30 * DAY, resetAt ? Date.parse(resetAt) : 0));
  const historyRows = await d.select().from(events).where(and(eq(events.protocolId, p.id), gte(events.detectedAt, since)));
  const history = historyRows.map((e) => ({ type: e.type as OverwatchEvent["type"], severity: e.severity as OverwatchEvent["severity"], weakening: e.weakening, title: e.title, detectedAt: e.detectedAt.toISOString(), blockTime: e.blockTime?.toISOString() ?? null }));

  let inserted: (OverwatchEvent & { id: number })[] = [];
  const changed = !prev || prev.contentHash !== hash;
  if (changed) {
    await d.insert(snapshots).values({ protocolId: p.id, slot: snap.slot, contentHash: hash, data: snap });
    const now = new Date().toISOString();
    const evs = prev ? diffSnapshots(prev.data as ControlSnapshot, snap, { history, slot: snap.slot, blockTime: o.blockTime ?? now, txSignature: o.txSignature ?? null, now, name: p.name }) : [];
    for (const e of evs) {
      const [row] = await d.insert(events).values({
        protocolId: p.id, type: e.type, severity: e.severity, weakening: e.weakening, title: e.title, explanation: e.explanation, labels: e.labels,
        before: e.before ?? null, after: e.after ?? null, slot: e.slot, blockTime: e.blockTime ? new Date(e.blockTime) : null, txSignature: e.txSignature, source: o.source,
      }).onConflictDoNothing().returning({ id: events.id });
      if (row) inserted.push({ ...e, id: row.id });
    }
  }
  const allRecent = [...history, ...inserted.map((e) => ({ ...e }))];
  const score = scoreSnapshot(snap, allRecent);
  const [last] = await d.select().from(scores).where(eq(scores.protocolId, p.id)).orderBy(desc(scores.computedAt)).limit(1);
  if (!last || last.score !== score.score || last.flags !== score.flags || changed || o.force) {
    await d.insert(scores).values({ protocolId: p.id, score: score.score, grade: score.grade, flags: score.flags, breakdown: score.breakdown });
  }
  for (const e of inserted) {
    await sql().notify(CHANNEL, JSON.stringify({ kind: "event", id: e.id, slug: p.slug, name: p.name, type: e.type, severity: e.severity, title: e.title, explanation: e.explanation, txSignature: e.txSignature, labels: e.labels, at: e.detectedAt }));
    await enqueueDeliveries(p.id, e.id, e.severity);
  }
  if (inserted.length || changed) await sql().notify(CHANNEL, JSON.stringify({ kind: "score", slug: p.slug, score: score.score, grade: score.grade, flags: score.flags.toString(), red: score.red }));
  inserted = inserted.sort((a, b) => a.id - b.id);
  return { stored: changed, events: inserted, score };
}

export async function enqueueDeliveries(protocolId: number, eventId: number, severity: string) {
  const d = db();
  const subs = await d.select().from(subscriptions).where(eq(subscriptions.active, true));
  for (const s of subs) {
    if (!severitiesAtLeast(s.minSeverity).includes(severity)) continue;
    if (s.protocolIds && s.protocolIds.length && !s.protocolIds.includes(protocolId)) continue;
    await d.insert(deliveries).values({ subscriptionId: s.id, eventId }).onConflictDoNothing();
  }
}
