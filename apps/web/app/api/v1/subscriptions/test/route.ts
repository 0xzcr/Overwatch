import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, subscriptions, eq } from "@overwatch/db";
import { testFire } from "@/lib/testfire";
import { guard, hit, sameSecret, ok, err, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";
/** Test-fire a webhook: sends a signed sample payload and reports the receiver's status. */
async function handlePOST(req: NextRequest) {
  const g = await guard(req);
  if (!("tier" in g)) return g;
  const p = z.object({ id: z.number().int(), secret: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, "id and secret required");
  const [s] = await db().select().from(subscriptions).where(eq(subscriptions.id, p.data.id));
  if (!s || s.channel !== "webhook" || !sameSecret(s.secret, p.data.secret)) return err(404, "subscription not found");
  if (!(await hit(`test-fire:${s.id}`, 10, 3600)).ok) return err(429, "at most 10 test alerts per webhook per hour");
  return ok(await testFire(s.target, s.secret!));
}

export const POST = withDb(handlePOST);
