/** Pushes score + flags to the devnet registry (debounced: ≤1/min per protocol unless critical) and runs the vault keeper. */
import { Keypair, PublicKey } from "@solana/web3.js";
import { RegistryIx, VaultIx } from "@overwatch/sdk/tx";
import { fetchRiskRecord } from "@overwatch/sdk";
import { db, onchainPublishes, events, eq, desc, notify, type protocols } from "@overwatch/db";
import { connection, keys, hasState, loadState, rearmVault, send, DEMO_SLUG } from "@overwatch/demo";
import type { ScoreResult } from "@overwatch/core";
import { log } from "./log";

const GRADE_IDX = { A: 0, B: 1, C: 2, D: 3, F: 4 } as const;
type Row = typeof protocols.$inferSelect;
const lastPush = new Map<string, { at: number; score: number; flags: bigint }>();
const pending = new Map<string, NodeJS.Timeout>();

// undefined = not tried yet; null = keypairs missing, so publishing stays off until restart (and the log says so once).
let publisher: Keypair | null | undefined;
function getPublisher() {
  if (publisher === undefined) {
    try {
      publisher = keys().publisher;
    } catch (e) {
      publisher = null;
      log(
        "publisher",
        `demo keypairs not loaded (${(e as Error).message.split("\n")[0]}): onchain publishing disabled`,
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
  const sig = await send(conn, [ix], [kp], undefined, `upsert_risk ${p.slug}`);
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
  if (p.slug === DEMO_SLUG) await keeper(p, score.red);
}

/** Keeper: after a red registry update, call the permissionless check_and_exit for affected vault positions. */
async function keeper(p: Row, red: boolean) {
  if (!hasState()) return;
  const s = loadState();
  const conn = connection();
  const k = keys();
  const vix = new VaultIx(new PublicKey(s.mint), process.env.VAULT_PROGRAM_ID, process.env.REGISTRY_PROGRAM_ID);
  const pos = await conn.getAccountInfo(vix.position(p.slug));
  if (!pos) return;
  const shielded = pos.data[112] === 1;
  if (red && !shielded) {
    const sig = await send(
      conn,
      [vix.checkAndExit(k.publisher.publicKey, p.slug)],
      [k.publisher],
      undefined,
      "check_and_exit",
    );
    await db()
      .insert(onchainPublishes)
      .values({ protocolId: p.id, txSignature: sig, score: 0, flags: 0n, status: "confirmed", kind: "shield" });
    await notify({ kind: "shield", slug: p.slug, txSignature: sig, amount: "40000" });
    log("keeper", `ShieldTriggered for ${p.slug}: ${sig}`);
  } else if (!red && shielded && process.env.DEMO_MODE === "true") {
    const sig = await rearmVault(() => {});
    if (sig) {
      await notify({ kind: "rearm", slug: p.slug, txSignature: sig });
      log("keeper", `re-armed ${p.slug}: ${sig}`);
    }
  }
}
