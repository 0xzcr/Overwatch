import type { NextRequest } from "next/server";
import { db, subscriptions, eq, and } from "@overwatch/db";
import { ok, err, hit } from "@/lib/api";
import { withAccount } from "@/lib/account";
import { testFire } from "@/lib/testfire";

export const dynamic = "force-dynamic";

/** Sends a signed sample alert to one of the account's webhooks. */
export const POST = withAccount(async (_req: NextRequest, account, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [s] = await db()
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.accountId, account.id)));
  if (!s || s.channel !== "webhook" || !s.secret) return err(404, "webhook not found");
  if (!(await hit(`test-fire:${s.id}`, 10, 3600)).ok) return err(429, "at most 10 test alerts per webhook per hour");
  return ok(await testFire(s.target, s.secret));
});
