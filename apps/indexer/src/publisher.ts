/** Pushes score + flags to the devnet registry (debounced: ≤1/min per protocol unless critical). */
import type { Keypair } from "@solana/web3.js";
import { RegistryIx } from "@overwatch/sdk/tx";
import { fetchRiskRecord } from "@overwatch/sdk";
import { db, onchainPublishes, events, eq, desc, notify, type protocols } from "@overwatch/db";
import type { ScoreResult } from "@overwatch/core";
import { log } from "./log";
import { connection, publisherKey, send } from "./devnet";

const GRADE_IDX = { A: 0, B: 1, C: 2, D: 3, F: 4 } as const;
type Row = typeof protocols.$inferSelect;
const lastPush = new Map<string, { at: number; score: number; flags: bigint }>();
const pending = new Map<string, NodeJS.Timeout>();

// undefined = not tried yet; null = keypairs missing, so publishing stays off until restart (and the log says so once).
let publisher: Keypair | null | undefined;
function getPublisher() {
  if (publisher === undefined) {
    try {
      publisher = publisherKey();
    } catch (e) {
      publisher = null;
      log(
        "publisher",
        `publisher keypair not loaded (${(e as Error).message.split("\n")[0]}): onchain publishing disabled`,
      );
    }
  }
  return publisher;
}

export function schedulePublish(p: Row, score: ScoreResult, critical: boolean) {
  if (!process.env.REGISTRY_PROGRAM_ID) return;
  const prev = lastPush.get(p.slug);
  if (prev && prev.score === score.score && prev.flags === score.flags) return;
  const wait = critical || !prev ? 0 : Math.max(0, 60_000 - (Date.now() - prev.at));
  clearTimeout(pending.get(p.slug));
  pending.set(
    p.slug,
    setTimeout(
      () => void publish(p, score).catch((e) => log("publisher", `${p.slug}: ${(e as Error).message.split("\n")[0]}`)),
      wait,
    ),
  );
}

const inflight = new Set<string>();
async function publish(p: Row, score: ScoreResult) {
  const kp = getPublisher();
  if (!kp || inflight.has(p.slug)) return;
  const prev = lastPush.get(p.slug);
  if (prev && prev.score === score.score && prev.flags === score.flags) return;
  inflight.add(p.slug);
  try {
    await doPublish(p, score, kp);
  } finally {
    inflight.delete(p.slug);
  }
}

async function doPublish(p: Row, score: ScoreResult, kp: Keypair) {
  const conn = connection();
  const reg = new RegistryIx(process.env.REGISTRY_PROGRAM_ID);
  const [lastEv] = await db()
    .select({ slot: events.slot })
    .from(events)
    .where(eq(events.protocolId, p.id))
    .orderBy(desc(events.slot))
    .limit(1);
  // registry rejects stale last_event_slot: never go backwards
  const onchain = await fetchRiskRecord(conn.rpcEndpoint, p.slug, process.env.REGISTRY_PROGRAM_ID).catch(() => null);
  const lastEventSlot = BigInt(Math.max(Number(lastEv?.slot ?? 0), Number(onchain?.lastEventSlot ?? 0)));
  const ix = reg.upsertRisk(kp.publicKey, p.slug, score.score, GRADE_IDX[score.grade], score.flags, lastEventSlot);
  const sig = await send(conn, [ix], [kp], `upsert_risk ${p.slug}`);
  lastPush.set(p.slug, { at: Date.now(), score: score.score, flags: score.flags });
  await db()
    .insert(onchainPublishes)
    .values({
      protocolId: p.id,
      txSignature: sig,
      score: score.score,
      flags: score.flags,
      slot: Number(lastEventSlot),
      status: "confirmed",
      kind: "registry",
    });
  await notify({
    kind: "registry",
    slug: p.slug,
    score: score.score,
    grade: score.grade,
    flags: score.flags.toString(),
    red: score.red,
    txSignature: sig,
  });
  log("publisher", `${p.slug} → registry score=${score.score} ${score.grade} red=${score.red} ${sig}`);
}
