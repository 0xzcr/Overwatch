import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, subscriptions, eq } from "@overwatch/db";
import { webhookUrlProblem } from "@overwatch/core/net";
import { signPayload } from "@/lib/webhook";
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
  // Re-checked at send time: the host's DNS may have changed since the webhook was created.
  const bad = await webhookUrlProblem(s.target);
  if (bad) return ok({ delivered: false, error: `refused: url ${bad}` });
  const payload = JSON.stringify({
    test: true,
    event: {
      type: "TIMELOCK_REMOVED",
      severity: "CRITICAL",
      protocol: "example",
      title: "Test alert from Overwatch",
      explanation: "If you can read this, your webhook works.",
      detected_at: new Date().toISOString(),
    },
  });
  try {
    const r = await fetch(s.target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-overwatch-signature": signPayload(payload, s.secret!),
        "user-agent": "Overwatch-Webhook/1",
      },
      body: payload,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return ok({ delivered: r.ok, status: r.status });
  } catch (e) {
    return ok({ delivered: false, error: (e as Error).message });
  }
}

export const POST = withDb(handlePOST);
