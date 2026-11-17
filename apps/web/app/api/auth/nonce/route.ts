import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { accountsOpen, hmac } from "@/lib/session";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Sign-in challenge lifetime: long enough to open a wallet, short enough that a stolen message is useless. */
const TTL_MS = 10 * 60_000;

/**
 * Hands out a one-time sign-in challenge. Stateless: the token is our HMAC over the challenge, so the verify step
 * can trust nonce, issue time and expiry without storing them. Single use is enforced at verify time.
 */
export async function GET(req: NextRequest) {
  if (!accountsOpen()) return err(503, "accounts are coming soon");
  const nonce = randomBytes(12).toString("hex");
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + TTL_MS).toISOString();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "overwatch1.xyz";
  return ok({ nonce, issuedAt, expirationTime, domain: host, token: hmac(`${nonce}|${issuedAt}|${expirationTime}`) });
}
