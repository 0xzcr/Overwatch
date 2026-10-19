import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, apiKeys, eq, dsql } from "@overwatch/db";

export const API_VERSION = "2026-10-11";
const ANON_PER_MINUTE = 30;

export function clientIp(req: NextRequest) {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

// Used only when the database can't be reached, so limits still apply (per instance) instead of failing open.
const fallback = new Map<string, { n: number; reset: number }>();

/**
 * Fixed-window counter shared by every server instance (Postgres `rate_limits`). Returns whether this call is within
 * `limit` per `windowSec`, and how many seconds until the window resets.
 */
export async function hit(
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    const rows = await db().execute<{ n: number; reset_at: string | Date }>(dsql`
      insert into rate_limits (bucket, n, reset_at) values (${bucket}, 1, now() + make_interval(secs => ${windowSec}))
      on conflict (bucket) do update set
        n = case when rate_limits.reset_at <= now() then 1 else rate_limits.n + 1 end,
        reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
      returning n, reset_at`);
    const r = [...rows][0]!;
    if (Math.random() < 0.01)
      void db().execute(dsql`delete from rate_limits where reset_at < now() - interval '1 day'`);
    return {
      ok: r.n <= limit,
      retryAfter: Math.max(1, Math.ceil((new Date(r.reset_at).getTime() - Date.now()) / 1000)),
    };
  } catch {
    const now = Date.now();
    const b = fallback.get(bucket);
    if (!b || b.reset <= now) {
      fallback.set(bucket, { n: 1, reset: now + windowSec * 1000 });
      return { ok: true, retryAfter: windowSec };
    }
    return { ok: ++b.n <= limit, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
}

const tooMany = (limit: number, per: string, retryAfter: number, error = "rate limit exceeded") =>
  NextResponse.json(
    { version: API_VERSION, error, limit, per },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );

/** Optional API key (higher limits), then the per-minute rate limit. Anonymous use is allowed. */
export async function guard(req: NextRequest): Promise<NextResponse | { tier: string }> {
  const key = req.headers.get("x-api-key");
  let limit = ANON_PER_MINUTE,
    bucket = `ip:${clientIp(req)}`,
    tier = "anonymous";
  if (key) {
    const [row] = await db()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, createHash("sha256").update(key).digest("hex")));
    if (!row || row.revokedAt) return err(401, "invalid api key");
    limit = row.rateLimit;
    bucket = `key:${row.id}`;
    tier = row.tier;
  }
  const h = await hit(bucket, limit, 60);
  return h.ok ? { tier } : tooMany(limit, "minute", h.retryAfter);
}

/** Caps how many subscriptions one IP can create per day (on top of the per-minute limit). */
export async function signupLimit(req: NextRequest, kind: string, perDay = 5) {
  const h = await hit(`signup:${kind}:${clientIp(req)}`, perDay, 86_400);
  return h.ok ? null : tooMany(perDay, "day", h.retryAfter, `too many ${kind} subscriptions from this address today`);
}

/** Constant-time secret comparison. */
export function sameSecret(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const ok = (data: unknown, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ version: API_VERSION, ...extra, data }, { headers: { "cache-control": "no-store" } });
export const err = (status: number, error: string) => NextResponse.json({ version: API_VERSION, error }, { status });

const dbDown = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|CONNECT_TIMEOUT|CONNECTION_/i.test(
    `${x?.code ?? ""} ${x?.message ?? ""}`,
  );
};

/** Wraps a route handler so an unreachable database answers 503 with a JSON error instead of a bare 500. */
export function withDb<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (dbDown(e)) return err(503, "database unavailable");
      throw e;
    }
  };
}
