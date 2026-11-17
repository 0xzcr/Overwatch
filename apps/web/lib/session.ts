import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db, accounts, eq } from "@overwatch/db";

/**
 * Sessions are a signed cookie: "<accountId>.<expiry>.<hmac>". Nothing is stored server-side, so signing in works on
 * every server instance. The cookie is httpOnly, and SameSite=Lax plus an Origin check (sameOrigin) stop other sites
 * from acting with it.
 */
const COOKIE = "ow_session";
const MAX_AGE_SEC = 30 * 86_400;

// A random secret per process in development, so nothing insecure is ever hard-coded; production must set one.
const devSecret = randomBytes(32).toString("hex");
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ characters) is not set");
  return devSecret;
}

/** Wallet sign-in, the dashboard and paid plans stay closed until ACCOUNTS_OPEN=true. */
export const accountsOpen = () => process.env.ACCOUNTS_OPEN === "true";

export const hmac = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "value.signature" → value, when the signature is ours. */
export function unsign(token: string | undefined): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut < 0) return null;
  const value = token.slice(0, cut);
  return safeEqual(token.slice(cut + 1), hmac(value)) ? value : null;
}

export async function startSession(accountId: number) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const value = `${accountId}.${expires}`;
  (await cookies()).set(COOKIE, `${value}.${hmac(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export type Account = typeof accounts.$inferSelect;

/** The signed-in account, or null. */
export async function currentAccount(): Promise<Account | null> {
  const value = unsign((await cookies()).get(COOKIE)?.value);
  if (!value) return null;
  const [id, expires] = value.split(".").map(Number);
  if (!id || !expires || expires * 1000 < Date.now()) return null;
  const [row] = await db().select().from(accounts).where(eq(accounts.id, id));
  return row ?? null;
}

/** Writes from the browser must come from this site (defence in depth on top of SameSite cookies). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
