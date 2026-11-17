import { desc, eq, gte, and } from "drizzle-orm";
import {
  diffSnapshots,
  scoreSnapshot,
  snapshotHash,
  gradeChangeEvent,
  RULESET_VERSION,
  type ControlSnapshot,
  type OverwatchEvent,
  type ProtocolConfig,
} from "@overwatch/core";
import { db, sql, CHANNEL } from "./client";
import { events, protocols, scores, snapshots, subscriptions, deliveries, accounts } from "./schema";
import { wantsAlert } from "@overwatch/core";

type ProtocolRow = typeof protocols.$inferSelect;
export interface IngestResult {
  stored: boolean;
  events: (OverwatchEvent & { id: number })[];
  score: ReturnType<typeof scoreSnapshot>;
}

const DAY = 86_400_000;

/** Store snapshot if changed, diff vs previous, persist events, rescore, NOTIFY and enqueue deliveries. */
export async function ingestSnapshot(
  p: ProtocolRow,
  snap: ControlSnapshot,
  o: {
    source: "live" | "backfill";
    txSignature?: string | null;
    blockTime?: string | null;
    force?: boolean;
  } = { source: "live" },
): Promise<IngestResult> {
  const d = db();
  const hash = snapshotHash(snap);
  const [prev] = await d
    .select()
    .from(snapshots)
    .where(eq(snapshots.protocolId, p.id))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(1);
  const since = new Date(Date.now() - 30 * DAY);
  const historyRows = await d
    .select()
    .from(events)
    .where(and(eq(events.protocolId, p.id), gte(events.detectedAt, since)));
  const history = historyRows.map((e) => ({
    type: e.type as OverwatchEvent["type"],
    severity: e.severity as OverwatchEvent["severity"],
    weakening: e.weakening,
    title: e.title,
    detectedAt: e.detectedAt.toISOString(),
    blockTime: e.blockTime?.toISOString() ?? null,
  }));

  let inserted: (OverwatchEvent & { id: number })[] = [];
  const changed = !prev || prev.contentHash !== hash;
  if (changed) {
    await d.insert(snapshots).values({ protocolId: p.id, slot: snap.slot, contentHash: hash, data: snap });
    const now = new Date().toISOString();
    const evs = prev
      ? diffSnapshots(prev.data as ControlSnapshot, snap, {
          history,
          slot: snap.slot,
          blockTime: o.blockTime ?? now,
          txSignature: o.txSignature ?? null,
          now,
          name: p.name,
        })
      : [];
    for (const e of evs) {
      const [row] = await d
        .insert(events)
        .values({
          protocolId: p.id,
          type: e.type,
          severity: e.severity,
          weakening: e.weakening,
          title: e.title,
          explanation: e.explanation,
          labels: e.labels,
          before: e.before ?? null,
          after: e.after ?? null,
          slot: e.slot,
          blockTime: e.blockTime ? new Date(e.blockTime) : null,
          txSignature: e.txSignature,
          source: o.source,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (row) inserted.push({ ...e, id: row.id });
    }
  }
  const allRecent = [...history, ...inserted.map((e) => ({ ...e }))];
  const cfg = p.config as Partial<ProtocolConfig>;
  const context = {
    category: p.category,
    exitLatencySec: cfg.exit_hours !== undefined ? cfg.exit_hours * 3600 : 0,
    adminLimits: cfg.admin_limits,
  };
  const score = scoreSnapshot(snap, allRecent, undefined, context);
  const [last] = await d
    .select()
    .from(scores)
    .where(eq(scores.protocolId, p.id))
    .orderBy(desc(scores.computedAt))
    .limit(1);
  // a new ruleset or a new letter is a new score even when the 0-100 number and flags happen to match
  const regraded = !!last && (last.grade !== score.grade || last.ruleset !== RULESET_VERSION);
  if (!last || last.score !== score.score || last.flags !== score.flags || regraded || changed || o.force) {
    await d.insert(scores).values({
      protocolId: p.id,
      score: score.score,
      grade: score.grade,
      flags: score.flags,
      breakdown: score.breakdown,
      capabilities: score.capabilities,
      ruleset: RULESET_VERSION,
    });
    // A grade change is the headline alert. Grades from an older ruleset are not comparable, so they never trigger one.
    // "?" (unverified) is not a step on the scale; handing control to something unreadable has its own event
    if (
      last &&
      last.ruleset === RULESET_VERSION &&
      last.grade !== score.grade &&
      last.grade !== "?" &&
      score.grade !== "?"
    ) {
      const best = await bestRecentGrade(p.id);
      const e = gradeChangeEvent({
        name: p.name,
        protocol: p.slug,
        from: last.grade as Exclude<typeof score.grade, "?">,
        to: score.grade,
        red: score.red,
        best90d: best,
        reason: score.breakdown[0]?.reason ?? "",
        slot: snap.slot,
        now: new Date().toISOString(),
        txSignature: o.txSignature ?? null,
      });
      const [row] = await d
        .insert(events)
        .values({
          protocolId: p.id,
          type: e.type,
          severity: e.severity,
          weakening: e.weakening,
          title: e.title,
          explanation: e.explanation,
          labels: e.labels,
          before: e.before,
          after: e.after,
          slot: e.slot,
          blockTime: new Date(e.detectedAt),
          txSignature: e.txSignature,
          source: o.source,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (row) inserted.push({ ...e, id: row.id });
    }
  }
  // the live stream is public, so a private watch never goes out on it (its owner still gets deliveries)
  const isPublic = p.visibility === "public";
  for (const e of inserted) {
    if (isPublic)
      await sql().notify(
        CHANNEL,
        JSON.stringify({
          kind: "event",
          id: e.id,
          slug: p.slug,
          name: p.name,
          type: e.type,
          severity: e.severity,
          weakening: e.weakening,
          slot: e.slot,
          source: o.source,
          title: e.title,
          explanation: e.explanation,
          txSignature: e.txSignature,
          labels: e.labels,
          at: e.detectedAt,
        }),
      );
    await enqueueDeliveries(p.id, e.id, e.severity);
  }
  if (isPublic && (inserted.length || changed))
    await sql().notify(
      CHANNEL,
      JSON.stringify({
        kind: "score",
        slug: p.slug,
        score: score.score,
        grade: score.grade,
        flags: score.flags.toString(),
        red: score.red,
      }),
    );
  inserted = inserted.sort((a, b) => a.id - b.id);
  return { stored: changed, events: inserted, score };
}

/** The best grade this protocol held in the last 90 days under the current ruleset (for the slow-erosion alarm). */
async function bestRecentGrade(protocolId: number) {
  const since = new Date(Date.now() - 90 * DAY);
  const rows = await db()
    .select({ grade: scores.grade })
    .from(scores)
    .where(and(eq(scores.protocolId, protocolId), eq(scores.ruleset, RULESET_VERSION), gte(scores.computedAt, since)));
  const order = ["A", "B", "C", "D", "F"];
  const ranks = rows.map((r) => order.indexOf(r.grade)).filter((rank) => rank >= 0);
  return ranks.length ? (order[Math.min(...ranks)] as "A" | "B" | "C" | "D" | "F") : null;
}

export async function enqueueDeliveries(protocolId: number, eventId: number, severity: string) {
  const d = db();
  const [protocol] = await d.select().from(protocols).where(eq(protocols.id, protocolId));
  const subs = await d
    .select({ s: subscriptions, account: accounts })
    .from(subscriptions)
    .leftJoin(accounts, eq(subscriptions.accountId, accounts.id))
    .where(and(eq(subscriptions.active, true), eq(subscriptions.confirmed, true)));
  for (const { s, account } of subs) {
    if (!wantsAlert({ subscription: s, account, protocol, severity })) continue;
    await d.insert(deliveries).values({ subscriptionId: s.id, eventId }).onConflictDoNothing();
  }
}
