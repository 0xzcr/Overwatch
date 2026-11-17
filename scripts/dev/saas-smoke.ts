/**
 * End-to-end check of the SaaS layer against a running site (pnpm dev) and its database, no wallet extension needed:
 *
 *   1. sign in with a fresh ed25519 wallet key through /api/auth/nonce + /api/auth/verify (the real SIWS check)
 *   2. a free account is refused webhooks and API keys (402)
 *   3. an invoice can be created and is not yet paid
 *   4. with a paid plan (set in the database here; the payment check itself is covered by core unit tests),
 *      a webhook is added and its test fire arrives signed
 *   5. a watched protocol drops a grade: the GRADE_LOWERED alert is delivered to the webhook, signed
 *   6. an API key works and an unknown key is refused
 *   7. the private-watch filter: a private protocol never appears in the public API
 *
 * Everything it creates is deleted at the end.
 *   (the site must run with ACCOUNTS_OPEN=true)
 *   SITE=http://localhost:3000 pnpm exec tsx scripts/dev/saas-smoke.ts
 */
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { signInMessage, type ControlSnapshot } from "@overwatch/core";
import { db, sql, accounts, protocols, ingestSnapshot, eq } from "@overwatch/db";
import { deliverPending } from "../../apps/bot/src/deliver";

process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";
const SITE = process.env.SITE ?? "http://localhost:3000";
const ORIGIN = new URL(SITE).origin;
const SLUG = "saas-smoke";

let failures = 0;
const check = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${what}${!ok && detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

// ── a local webhook receiver that records every request ──
const received: { body: string; signature: string }[] = [];
const server = createServer((req: IncomingMessage, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ body, signature: String(req.headers["x-overwatch-signature"] ?? "") });
    res.writeHead(200).end("ok");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

// ── a session-carrying client for the site ──
let cookie = "";
async function call<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${SITE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0]!;
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: string };
  return { status: r.status, data: j.data, error: j.error };
}

const secretKey = ed25519.utils.randomPrivateKey();
const wallet = bs58.encode(ed25519.getPublicKey(secretKey));
let protocolId: number | null = null;

try {
  // 1. sign in
  const challenge = await call<{
    nonce: string;
    issuedAt: string;
    expirationTime: string;
    domain: string;
    token: string;
  }>("/api/auth/nonce");
  const c = challenge.data!;
  const message = signInMessage({ ...c, address: wallet, uri: ORIGIN });
  const signature = Buffer.from(ed25519.sign(new TextEncoder().encode(message), secretKey)).toString("base64");
  const forged = await call("/api/auth/verify", "POST", {
    ...c,
    address: wallet,
    signature: Buffer.alloc(64).toString("base64"),
  });
  check(forged.status === 401, "a wrong signature is refused", `HTTP ${forged.status}`);
  const signin = await call("/api/auth/verify", "POST", { ...c, address: wallet, signature });
  check(signin.status === 200 && !!cookie, "sign-in with a real wallet signature starts a session", signin.error);
  const replay = await call("/api/auth/verify", "POST", { ...c, address: wallet, signature });
  check(replay.status === 401, "the same signed challenge cannot be replayed", `HTTP ${replay.status}`);
  const crossSite = await fetch(`${SITE}/api/account`, {
    method: "PATCH",
    headers: { origin: "https://evil.example", cookie, "content-type": "application/json" },
    body: "{}",
  });
  check(crossSite.status === 403, "a cross-site write is refused", `HTTP ${crossSite.status}`);

  const me = await call<{ plan: { id: string } }>("/api/account");
  check(me.data?.plan.id === "free", "a new account starts on Free");

  // 2. free limits
  const hookFree = await call("/api/account/channels", "POST", { channel: "webhook", url: hookUrl });
  check(hookFree.status === 402, "Free cannot add a webhook", `HTTP ${hookFree.status}`);
  const keyFree = await call("/api/account/keys", "POST", {});
  check(keyFree.status === 402, "Free cannot create an API key", `HTTP ${keyFree.status}`);

  // 3. invoice
  const invoice = await call<{ id: number; amount: string; solanaPay: string }>("/api/billing/invoices", "POST", {
    plan: "pro",
    months: 1,
  });
  if (invoice.status === 503)
    console.log("· billing not configured on this server (set BILLING_TREASURY), invoice checks skipped");
  else {
    check(
      invoice.status === 200 && /^19\.\d{6}$/.test(invoice.data?.amount ?? ""),
      "a Pro invoice is 19 USDC plus a unique fraction",
      invoice.data?.amount,
    );
    check(!!invoice.data?.solanaPay.startsWith("solana:"), "the invoice carries a Solana Pay link");
    const unpaid = await call<{ paid: boolean }>(`/api/billing/invoices/${invoice.data!.id}/check`, "POST", {});
    check(unpaid.status === 200 && unpaid.data?.paid === false, "an unpaid invoice reads as not paid", unpaid.error);
  }

  // 4. paid plan → webhook + test fire
  await db()
    .update(accounts)
    .set({ plan: "pro", planExpiresAt: new Date(Date.now() + 86_400_000) })
    .where(eq(accounts.wallet, wallet));
  const hook = await call<{ id: number; secret: string }>("/api/account/channels", "POST", {
    channel: "webhook",
    url: hookUrl,
    minSeverity: "MEDIUM",
  });
  check(hook.status === 200 && !!hook.data?.secret, "Pro adds a webhook and gets its secret once", hook.error);
  const fire = await call<{ delivered: boolean }>(`/api/account/channels/${hook.data!.id}/test`, "POST", {});
  const testHit = received.at(-1);
  const signed = (r: { body: string; signature: string }) =>
    r.signature === createHmac("sha256", hook.data!.secret).update(r.body).digest("hex");
  check(!!fire.data?.delivered && !!testHit && signed(testHit), "the test alert arrives with a valid signature");

  // 5. a grade drop on a watched protocol is delivered
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
        upgradeAuthority: "smoke-vault",
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
        threshold: 3,
        members: ["a", "b", "c", "d", "e"].map((key) => ({ key, permissions: 7 })),
        timeLockSec,
        configAuthority: null,
        transactionIndex: 1,
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
  const [row] = await db()
    .insert(protocols)
    .values({ slug: SLUG, name: "SaaS Smoke", category: "dex", config: {}, verified: true })
    .returning();
  protocolId = row!.id;
  const watch = await call("/api/account", "PATCH", { watchlist: [SLUG] });
  check(watch.status === 200, "the watchlist accepts the protocol", watch.error);
  await ingestSnapshot(row!, snapshot(8 * 86_400, 1)); // 3 keys, 8 days → B
  const dropped = await ingestSnapshot(row!, snapshot(0, 2), { source: "live", force: true }); // no delay → D
  const gradeEvent = dropped.events.find((e) => e.type === "GRADE_LOWERED");
  check(
    dropped.score.grade === "D" && !!gradeEvent,
    "removing the timelock drops B → D and raises GRADE_LOWERED",
    dropped.score.grade,
  );
  check(gradeEvent?.severity === "HIGH", "a two-grade drop is HIGH", gradeEvent?.severity);
  const before = received.length;
  await deliverPending(null, () => {});
  const alerts = received.slice(before);
  const gradeAlert = alerts.find((a) => a.body.includes("GRADE_LOWERED"));
  check(
    !!gradeAlert && signed(gradeAlert),
    "the grade-drop alert reaches the webhook, signed",
    `${alerts.length} deliveries`,
  );
  check(
    alerts.some((a) => a.body.includes("TIMELOCK_REMOVED")),
    "the timelock-removed alert is delivered too",
  );

  // 6. API keys
  const key = await call<{ key: string }>("/api/account/keys", "POST", {});
  check(key.status === 200 && !!key.data?.key.startsWith("ow_live_"), "Pro creates an API key", key.error);
  const withKey = await fetch(`${SITE}/api/v1/protocols`, { headers: { "x-api-key": key.data!.key } });
  check(withKey.status === 200, "the API key is accepted");
  const badKey = await fetch(`${SITE}/api/v1/protocols`, { headers: { "x-api-key": "ow_live_nope" } });
  check(badKey.status === 401, "an unknown API key is refused");

  // 7. a private protocol is invisible to the public API
  const [mine] = await db().select().from(accounts).where(eq(accounts.wallet, wallet));
  await db()
    .update(protocols)
    .set({ visibility: "private", ownerAccountId: mine!.id })
    .where(eq(protocols.id, protocolId));
  const pub = (await (await fetch(`${SITE}/api/v1/protocols`)).json()) as { data: { slug: string }[] };
  check(!pub.data.some((p) => p.slug === SLUG), "a private watch never appears in the public API");
  const direct = await fetch(`${SITE}/api/v1/protocols/${SLUG}`);
  check(direct.status === 404, "a private watch's public URL is 404", `HTTP ${direct.status}`);
  const page = await fetch(`${SITE}/app/watch/${SLUG}`, { headers: { cookie } });
  check(page.status === 200, "its owner can open it on the dashboard", `HTTP ${page.status}`);

  const out = await call("/api/auth/logout", "POST", {});
  const after = await call("/api/account");
  check(out.status === 200 && after.status === 401, "signing out ends the session");
} finally {
  if (protocolId) await db().delete(protocols).where(eq(protocols.id, protocolId));
  await db().delete(accounts).where(eq(accounts.wallet, wallet));
  server.close();
  await sql().end();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL SaaS CHECKS PASSED");
process.exit(failures ? 1 : 0);
