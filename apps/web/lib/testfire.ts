import "server-only";
import { webhookUrlProblem } from "@overwatch/core/net";
import { signPayload } from "./webhook";

/** Sends a signed sample alert to a webhook and reports what the receiver answered. Shared by every test button. */
export async function testFire(
  target: string,
  secret: string,
): Promise<{ delivered: boolean; status?: number; error?: string }> {
  // Re-checked at send time: the host's DNS may have changed since the webhook was created.
  const bad = await webhookUrlProblem(target);
  if (bad) return { delivered: false, error: `refused: url ${bad}` };
  const payload = JSON.stringify({
    test: true,
    event: {
      type: "GRADE_LOWERED",
      severity: "CRITICAL",
      protocol: "example",
      title: "Test alert from Overwatch",
      explanation: "If you can read this, your webhook works.",
      detected_at: new Date().toISOString(),
    },
  });
  try {
    const r = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-overwatch-signature": signPayload(payload, secret),
        "user-agent": "Overwatch-Webhook/1",
      },
      body: payload,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return { delivered: r.ok, status: r.status };
  } catch (e) {
    return { delivered: false, error: (e as Error).message };
  }
}
