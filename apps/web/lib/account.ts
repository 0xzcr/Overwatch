import "server-only";
import type { NextRequest } from "next/server";
import { effectivePlan } from "@overwatch/core";
import { accountsOpen, currentAccount, sameOrigin, type Account } from "./session";
import { err, withDb } from "./api";

type Handler<A extends unknown[]> = (req: NextRequest, account: Account, ...rest: A) => Promise<Response>;

/** Wraps an account route: requires a session and, for writes, a same-origin request. */
export function withAccount<A extends unknown[]>(handler: Handler<A>) {
  return withDb(async (req: NextRequest, ...rest: A) => {
    if (!accountsOpen()) return err(503, "accounts are coming soon");
    if (!sameOrigin(req)) return err(403, "cross-site request refused");
    const account = await currentAccount();
    if (!account) return err(401, "sign in with your wallet first");
    return handler(req, account, ...rest);
  });
}

/** The plan that applies now, plus when it ends. */
export const planOf = (account: Account) => ({
  ...effectivePlan(account),
  expiresAt: effectivePlan(account).id === "free" ? null : (account.planExpiresAt?.toISOString() ?? null),
});

/** Parses a JSON body with a zod schema into data or a 400 response. */
export async function body<T>(
  req: NextRequest,
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
  },
): Promise<{ data: T } | { error: Response }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  return { error: err(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")) };
}
