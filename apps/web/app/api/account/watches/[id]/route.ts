import type { NextRequest } from "next/server";
import { db, protocols, eq, and } from "@overwatch/db";
import { ok, err } from "@/lib/api";
import { withAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

/** Stops a private watch and deletes its history. */
export const DELETE = withAccount(async (_req: NextRequest, account, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const [row] = await db()
    .delete(protocols)
    .where(and(eq(protocols.id, id), eq(protocols.ownerAccountId, account.id)))
    .returning({ id: protocols.id });
  return row ? ok({ deleted: row.id }) : err(404, "watch not found");
});
