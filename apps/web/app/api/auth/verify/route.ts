import type { NextRequest } from "next/server";
import { z } from "zod";
import { signInMessage, verifyWalletSignature, isAddress } from "@overwatch/core";
import { db, accounts, dsql } from "@overwatch/db";
import { hmac, sameOrigin, startSession, accountsOpen } from "@/lib/session";
import { hit, ok, err, withDb, clientIp } from "@/lib/api";
import { planOf } from "@/lib/account";

export const dynamic = "force-dynamic";

const schema = z.object({
  address: z.string().refine(isAddress, "not a Solana address"),
  nonce: z.string().regex(/^[0-9a-f]{24}$/),
  issuedAt: z.string(),
  expirationTime: z.string(),
  token: z.string(),
  /** base64 of the 64-byte ed25519 signature */
  signature: z.string().max(200),
});

/** Checks the wallet's signature over the challenge, creates the account on first sign-in, and starts a session. */
async function handlePOST(req: NextRequest) {
  if (!accountsOpen()) return err(503, "accounts are coming soon");
  if (!sameOrigin(req)) return err(403, "cross-site request refused");
  if (!(await hit(`signin:${clientIp(req)}`, 20, 600)).ok) return err(429, "too many sign-in attempts, try again soon");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(400, "malformed sign-in request");
  const f = parsed.data;

  if (f.token !== hmac(`${f.nonce}|${f.issuedAt}|${f.expirationTime}`))
    return err(401, "challenge was not issued by us");
  if (Date.parse(f.expirationTime) < Date.now()) return err(401, "challenge expired, sign in again");

  // The message is rebuilt from values we trust (our host, our challenge); the wallet must have signed exactly this.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const message = signInMessage({
    domain: host,
    address: f.address,
    uri: `${proto}://${host}`,
    nonce: f.nonce,
    issuedAt: f.issuedAt,
    expirationTime: f.expirationTime,
  });
  const signature = Buffer.from(f.signature, "base64");
  if (!verifyWalletSignature(f.address, message, signature)) return err(401, "signature does not match this wallet");
  // a challenge works once: replaying a captured signature fails here
  if (!(await hit(`siws-nonce:${f.nonce}`, 1, 900)).ok) return err(401, "challenge already used, sign in again");

  const [account] = await db()
    .insert(accounts)
    .values({ wallet: f.address })
    .onConflictDoUpdate({ target: accounts.wallet, set: { lastSeenAt: dsql`now()` } })
    .returning();
  await startSession(account!.id);
  return ok({ wallet: account!.wallet, plan: planOf(account!) });
}

export const POST = withDb(handlePOST);
