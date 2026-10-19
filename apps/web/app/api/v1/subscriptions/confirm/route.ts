import { NextResponse, type NextRequest } from "next/server";
import { db, subscriptions, eq } from "@overwatch/db";
import { withDb } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The link in the confirmation email: activates the subscription, then shows the alerts page. */
async function handleGET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const back = (state: string) => NextResponse.redirect(new URL(`/alerts?email=${state}`, req.url), 303);
  if (!token || !/^[0-9a-f]{48}$/.test(token)) return back("invalid");
  const [row] = await db()
    .update(subscriptions)
    .set({ confirmed: true, confirmToken: null })
    .where(eq(subscriptions.confirmToken, token))
    .returning({ id: subscriptions.id });
  return back(row ? "confirmed" : "invalid");
}

export const GET = withDb(handleGET);
