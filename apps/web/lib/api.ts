import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, apiKeys, eq } from "@overwatch/db";

export const API_VERSION = "2026-10-11";
const buckets = new Map<string, { n: number; reset: number }>();

export async function guard(req: NextRequest): Promise<NextResponse | { tier: string }> {
  const key = req.headers.get("x-api-key");
  let limit = 30, id = `ip:${req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, tier = "anonymous";
  if (key) {
    const [row] = await db().select().from(apiKeys).where(eq(apiKeys.keyHash, createHash("sha256").update(key).digest("hex")));
    if (!row) return NextResponse.json({ version: API_VERSION, error: "invalid api key" }, { status: 401 });
    limit = row.rateLimit; id = `key:${row.id}`; tier = row.tier;
  }
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.reset < now) buckets.set(id, { n: 1, reset: now + 60_000 });
  else if (++b.n > limit) return NextResponse.json({ version: API_VERSION, error: "rate limit exceeded", limit_per_minute: limit }, { status: 429, headers: { "retry-after": String(Math.ceil((b.reset - now) / 1000)) } });
  return { tier };
}

export const ok = (data: unknown, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ version: API_VERSION, ...extra, data }, { headers: { "cache-control": "no-store" } });
export const err = (status: number, error: string) => NextResponse.json({ version: API_VERSION, error }, { status });

const dbDown = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|CONNECT_TIMEOUT|CONNECTION_/i.test(`${x?.code ?? ""} ${x?.message ?? ""}`);
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
