import type { NextRequest } from "next/server";
import { db, subscriptions, eq, and } from "@overwatch/db";
import { ok, err } from "@/lib/api";
import { withAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

/** Removes one of the account's channels (pending deliveries go with it). */
export const DELETE = withAccount(async (_req: NextRequest, account, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [row] = await db()
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.accountId, account.id)))
    .returning({ id: subscriptions.id });
  return row ? ok({ deleted: row.id }) : err(404, "channel not found");
});
