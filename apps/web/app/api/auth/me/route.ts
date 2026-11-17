import { currentAccount } from "@/lib/session";
import { planOf } from "@/lib/account";
import { ok, withDb } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Who is signed in (null when nobody is). Cheap enough for the nav to call on every page. */
export const GET = withDb(async () => {
  const account = await currentAccount();
  return ok(account ? { wallet: account.wallet, plan: planOf(account) } : null);
});
