import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, subscriptions, eq } from "@overwatch/db";
import { signPayload } from "@/lib/webhook";
import { ok, err } from "@/lib/api";

export const dynamic = "force-dynamic";
/** Test-fire a webhook: sends a signed sample payload and reports the receiver's status. */
export async function POST(req: NextRequest) {
  const p = z.object({ id: z.number().int(), secret: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return err(400, "id and secret required");
  const [s] = await db().select().from(subscriptions).where(eq(subscriptions.id, p.data.id));
  if (!s || s.secret !== p.data.secret) return err(404, "subscription not found");
  const payload = JSON.stringify({ test: true, event: { type: "TIMELOCK_REMOVED", severity: "CRITICAL", protocol: "overwatch-demo", title: "Test alert from Overwatch", explanation: "If you can read this, your webhook works.", detected_at: new Date().toISOString() } });
  try {
    const r = await fetch(s.target, { method: "POST", headers: { "content-type": "application/json", "x-overwatch-signature": signPayload(payload, s.secret!), "user-agent": "Overwatch-Webhook/1" }, body: payload, signal: AbortSignal.timeout(8000) });
    return ok({ delivered: r.ok, status: r.status });
  } catch (e) {
    return ok({ delivered: false, error: (e as Error).message });
  }
}
