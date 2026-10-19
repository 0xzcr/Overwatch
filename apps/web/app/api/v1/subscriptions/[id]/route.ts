import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, subscriptions, protocolIdsForSlugs, eq } from "@overwatch/db";
import { webhookUrlProblem } from "@overwatch/core/net";
import { guard, sameSecret, ok, err, withDb } from "@/lib/api";
import { describe, severity, protocolFilter } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Loads the subscription named in the URL, if the caller holds its secret (header x-subscription-secret). */
async function owned(req: NextRequest, ctx: Ctx) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const id = Number((await ctx.params).id);
  const secret = req.headers.get("x-subscription-secret");
  if (!Number.isInteger(id) || !secret) return err(401, "x-subscription-secret header required");
  const [s] = await db().select().from(subscriptions).where(eq(subscriptions.id, id));
  // Same answer for "no such id" and "wrong secret", so ids can't be probed. Telegram rows have no secret.
  if (!s || !sameSecret(s.secret, secret)) return err(404, "subscription not found");
  return s;
}

async function handleGET(req: NextRequest, ctx: Ctx) {
  const s = await owned(req, ctx);
  return s instanceof Response ? s : ok(await describe(s));
}

const patch = z
  .object({
    min_severity: severity.optional(),
    protocols: protocolFilter.optional(),
    active: z.boolean().optional(),
    url: z.string().url().optional(),
  })
  .strict();

async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const s = await owned(req, ctx);
  if (s instanceof Response) return s;
  const p = patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, p.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  const set: Partial<typeof subscriptions.$inferInsert> = {};
  if (p.data.min_severity) set.minSeverity = p.data.min_severity;
  if (p.data.active !== undefined) set.active = p.data.active;
  if (p.data.protocols !== undefined) {
    if (p.data.protocols === "all" || !p.data.protocols.length) set.protocolIds = null;
    else {
      const r = await protocolIdsForSlugs(p.data.protocols);
      if (r.unknown.length) return err(400, `unknown protocol(s): ${r.unknown.join(", ")}`);
      set.protocolIds = r.ids;
    }
  }
  if (p.data.url !== undefined) {
    if (s.channel !== "webhook") return err(400, "url can only be changed on a webhook");
    const bad = await webhookUrlProblem(p.data.url);
    if (bad) return err(400, `url: ${bad}`);
    set.target = p.data.url;
  }
  if (!Object.keys(set).length) return ok(await describe(s));
  const [row] = await db().update(subscriptions).set(set).where(eq(subscriptions.id, s.id)).returning();
  return ok(await describe(row!));
}

async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const s = await owned(req, ctx);
  if (s instanceof Response) return s;
  await db().delete(subscriptions).where(eq(subscriptions.id, s.id));
  return ok({ id: s.id, deleted: true });
}

export const GET = withDb(handleGET);
export const PATCH = withDb(handlePATCH);
export const DELETE = withDb(handleDELETE);
