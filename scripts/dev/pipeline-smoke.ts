/**
 * Offline end-to-end check of the alert pipeline, no RPC needed: Postgres → rules engine → events + scores →
 * NOTIFY (what /api/v1/stream relays) → webhook delivery with an HMAC signature.
 *
 * It registers a throwaway protocol, ingests a baseline (2-of-3 Squads, 2-day timelock) and a "timelock removed" snapshot through
 * the same ingestSnapshot() the indexer uses, runs the bot's delivery worker once, checks a local receiver got a
 * correctly signed CRITICAL alert, then deletes everything it created.
 *
 *   pnpm db:migrate && pnpm smoke:pipeline
 */
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ControlSnapshot } from "@overwatch/core";
import { db, sql, direct, protocols, subscriptions, deliveries, ingestSnapshot, eq, CHANNEL } from "@overwatch/db";
import { deliverPending } from "../../apps/bot/src/deliver";

// The receiver below is http://127.0.0.1, which production webhook delivery refuses.
process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";

const SLUG = "pipeline-smoke";
const SECRET = "whsec_pipeline_smoke";
const SIGNERS = ["signer-a", "signer-b", "signer-c"];
/** A 2-of-3 Squads v4 vault holding the upgrade authority, with the given timelock. */
const snapshot = (timeLockSec: number, slot: number): ControlSnapshot => ({
  protocol: SLUG,
  slot,
  takenAt: new Date().toISOString(),
  programs: [
    {
      programId: "smoke-program",
      label: "smoke program",
      programDataAddress: "smoke-program-data",
      lastDeploySlot: 0,
      upgradeAuthority: "smoke-multisig-vault",
      authorityKind: "SQUADS_V4_VAULT",
      authorityOwner: null,
      multisig: "smoke-multisig",
    },
  ],
  multisigs: [
    {
      address: "smoke-multisig",
      version: "v4",
      vaultIndex: 0,
      role: "upgrade_authority",
      threshold: 2,
      members: SIGNERS.map((key) => ({ key, permissions: 7 })),
      timeLockSec,
      configAuthority: "smoke-admin",
      transactionIndex: 0,
      staleTransactionIndex: 0,
      pending: [],
    },
  ],
  nonces: [],
  mints: [],
  oracles: [],
  admin: [],
  verified: true,
});
const fail = (m: string): never => {
  throw new Error(m);
};

// 1. A local webhook receiver that checks the signature.
const received: { body: string; validSig: boolean }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c: Buffer) => (body += c.toString()));
  req.on("end", () => {
    const sig = req.headers["x-overwatch-signature"];
    received.push({ body, validSig: sig === createHmac("sha256", SECRET).update(body).digest("hex") });
    res.writeHead(200).end("ok");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

const d = db();
const notified: string[] = [];
// LISTEN needs a session connection; a transaction pooler (DATABASE_URL on port 6543) drops it silently.
const listener = await direct().listen(CHANNEL, (payload) => notified.push(payload));

try {
  await d.delete(protocols).where(eq(protocols.slug, SLUG));
  const [p] = await d
    .insert(protocols)
    .values({
      slug: SLUG,
      name: "Pipeline Smoke Protocol",
      category: "lending",
      network: "devnet",
      source: "config",
      config: {},
      verified: true,
    })
    .returning();
  const [sub] = await d
    .insert(subscriptions)
    .values({ channel: "webhook", target: url, minSeverity: "HIGH", protocolIds: [p!.id], secret: SECRET })
    .returning();

  // 2. Baseline, then the timelock removed.
  const base = await ingestSnapshot(p!, snapshot(172_800, 0), { source: "live" });
  const r = await ingestSnapshot(p!, snapshot(0, 1), { source: "live", txSignature: null });
  console.log(
    `baseline score ${base.score.score} ${base.score.grade} · after change ${r.score.score} ${r.score.grade}${r.score.red ? " (red)" : ""}`,
  );
  const ev = r.events[0] ?? fail("no event was detected");
  console.log(`event: ${ev.severity} ${ev.title}`);
  if (ev.severity !== "CRITICAL") fail(`expected CRITICAL, got ${ev.severity}`);
  if (!r.score.red) fail("score should be red after the timelock is removed");

  // 3. Delivery worker, once.
  await deliverPending(null, (m) => console.log(`worker: ${m}`));
  const [dl] = await d.select().from(deliveries).where(eq(deliveries.subscriptionId, sub!.id));
  if (dl?.status !== "delivered") fail(`delivery status ${dl?.status ?? "missing"}: ${dl?.lastError ?? ""}`);
  const hit = received[0] ?? fail("the receiver got nothing");
  if (!hit.validSig) fail("webhook signature did not verify");
  const payload = JSON.parse(hit.body) as { event?: { severity?: string }; severity?: string };
  console.log(`webhook: delivered, signature ok, severity ${payload.event?.severity ?? payload.severity}`);

  // 4. NOTIFY is what the SSE stream forwards to browsers.
  await new Promise((res) => setTimeout(res, 1500)); // a distant database region can take a few round trips
  const kinds = notified.map((n) => (JSON.parse(n) as { kind: string }).kind);
  if (!kinds.includes("event") || !kinds.includes("score"))
    fail(`expected event and score notifications, got [${kinds.join(", ")}]`);
  console.log(`notify: ${kinds.join(", ")}`);
  console.log("pipeline ok");
} finally {
  await d.delete(subscriptions).where(eq(subscriptions.secret, SECRET));
  await d.delete(protocols).where(eq(protocols.slug, SLUG));
  await listener.unlisten();
  await Promise.all([sql().end(), direct().end()]);
  server.close();
}
